#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <cmath>

StandaloneMidi::StandaloneMidi(juce::MidiMessageCollector& collector) : collector_(collector)
{
    rescan();
    startTimer(1500);   // controladores que se enchufan o se sacan con la app abierta
}

StandaloneMidi::~StandaloneMidi()
{
    stopTimer();
    for (auto& in : inputs_)
        in->stop();
}

void StandaloneMidi::rescan()
{
    const auto devices = juce::MidiInput::getAvailableDevices();
    for (auto it = inputs_.begin(); it != inputs_.end();) {
        bool present = false;
        for (const auto& d : devices)
            if (d.identifier == (*it)->getIdentifier())
                present = true;
        if (present) {
            ++it;
        } else {
            (*it)->stop();
            it = inputs_.erase(it);
        }
    }
    for (const auto& d : devices) {
        bool open = false;
        for (const auto& in : inputs_)
            if (in->getIdentifier() == d.identifier)
                open = true;
        if (open)
            continue;
        if (auto in = juce::MidiInput::openDevice(d.identifier, this)) {
            in->start();
            inputs_.push_back(std::move(in));
        }
    }
}

PolyFiveProcessor::PolyFiveProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "POLYFIVE", createLayout())
{
    for (int i = 0; i < pf::NumParams; ++i) {
        params_[size_t(i)] = apvts.getRawParameterValue(pf::paramInfo(i).id);
        applied_[size_t(i)] = std::nanf("");   // fuerza a cargar todo en el primer bloque
    }
    engine_.prepare(44100.0);
    if (wrapperType == wrapperType_Standalone) {
        midiCollector_.reset(44100.0);
        standaloneMidi_ = std::make_unique<StandaloneMidi>(midiCollector_);
    }
}

juce::AudioProcessorValueTreeState::ParameterLayout PolyFiveProcessor::createLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    for (int i = 0; i < pf::NumParams; ++i) {
        const auto& info = pf::paramInfo(i);
        const juce::ParameterID pid { info.id, 1 };
        if (info.choices > 0) {
            layout.add(std::make_unique<juce::AudioParameterChoice>(
                pid, info.name, juce::StringArray::fromTokens(info.labels, "|", ""), int(info.def)));
        } else {
            // Como el original: escala de 0 a 10 (las de afinacion y el corte, de -5 a +5)
            const bool bipolar = i == pf::ATune || i == pf::BFreq || i == pf::BFine || i == pf::Tune;
            layout.add(std::make_unique<juce::AudioParameterFloat>(
                pid, info.name, juce::NormalisableRange<float>(0.f, 1.f, 1.f / 200.f), info.def,
                juce::AudioParameterFloatAttributes().withStringFromValueFunction(
                    [bipolar](float v, int) { return juce::String(bipolar ? (v - 0.5f) * 10.f : v * 10.f, 1); })));
        }
    }
    return layout;
}

void PolyFiveProcessor::prepareToPlay(double sampleRate, int)
{
    engine_.prepare(sampleRate);
    midiCollector_.reset(sampleRate);
    for (auto& a : applied_)
        a = std::nanf("");
}

bool PolyFiveProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

void PolyFiveProcessor::syncParams()
{
    for (int i = 0; i < pf::NumParams; ++i) {
        const float v = params_[size_t(i)]->load();
        if (!(v == applied_[size_t(i)])) {
            applied_[size_t(i)] = v;
            engine_.setParam(i, v);
        }
    }
}

void PolyFiveProcessor::handleMidi(const juce::MidiMessage& m)
{
    if (m.isNoteOn())
        engine_.noteOn(m.getNoteNumber(), m.getFloatVelocity());
    else if (m.isNoteOff())
        engine_.noteOff(m.getNoteNumber());
    else if (m.isAllNotesOff() || m.isAllSoundOff())
        engine_.allNotesOff();
    else if (m.isPitchWheel())
        engine_.setBend(float(m.getPitchWheelValue() - 8192) / 8192.f);
    else if (m.isController() && m.getControllerNumber() == 1)
        engine_.setModWheelExt(float(m.getControllerValue()) / 127.f);
}

void PolyFiveProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    buffer.clear();
    if (buffer.getNumChannels() < 2)
        return;
    syncParams();
    if (standaloneMidi_)
        midiCollector_.removeNextBlockOfMessages(midi, n);
    keyboardState.processNextMidiBuffer(midi, 0, n, true);
    const float ub = uiBend_.load(), um = uiMod_.load();
    if (ub != lastUiBend_) { lastUiBend_ = ub; engine_.setBend(ub); }
    if (um != lastUiMod_) { lastUiMod_ = um; engine_.setModWheelExt(um); }

    float* left = buffer.getWritePointer(0);
    float* right = buffer.getWritePointer(1);
    int pos = 0;
    // Cada mensaje MIDI cae en su muestra exacta
    for (const auto meta : midi) {
        const int at = juce::jlimit(0, n, meta.samplePosition);
        if (at > pos) {
            engine_.process(left + pos, right + pos, at - pos);
            pos = at;
        }
        handleMidi(meta.getMessage());
    }
    if (n > pos)
        engine_.process(left + pos, right + pos, n - pos);
    voices.store(engine_.activeVoices());
}

juce::AudioProcessorEditor* PolyFiveProcessor::createEditor()
{
    return new PolyFiveEditor(*this);
}

int PolyFiveProcessor::getNumPrograms() { return int(pf::presets().size()); }

const juce::String PolyFiveProcessor::getProgramName(int index)
{
    const auto& list = pf::presets();
    return index >= 0 && index < int(list.size()) ? juce::String(list[size_t(index)].name) : juce::String();
}

void PolyFiveProcessor::setCurrentProgram(int index)
{
    const auto& list = pf::presets();
    if (index < 0 || index >= int(list.size()))
        return;
    program_ = index;
    for (int i = 0; i < pf::NumParams; ++i) {
        const auto& info = pf::paramInfo(i);
        float value = info.def;
        for (const auto& pv : list[size_t(index)].values)
            if (pv.id == i)
                value = pv.value;
        if (auto* p = apvts.getParameter(info.id))
            p->setValueNotifyingHost(info.choices > 0 ? value / float(info.choices - 1) : value);
    }
}

void PolyFiveProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    state.setProperty("program", program_, nullptr);
    if (auto xml = state.createXml())
        copyXmlToBinary(*xml, destData);
}

void PolyFiveProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary(data, sizeInBytes))
        if (xml->hasTagName(apvts.state.getType())) {
            apvts.replaceState(juce::ValueTree::fromXml(*xml));
            program_ = int(apvts.state.getProperty("program", 0));
        }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new PolyFiveProcessor();
}
