#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <cmath>

AcidProcessor::AcidProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "ACIDLINE", createLayout())
{
    for (int i = 0; i < ac::NumParams; ++i) {
        params_[size_t(i)] = apvts.getRawParameterValue(ac::paramInfo(i).id);
        applied_[size_t(i)] = std::nanf("");   // fuerza a cargar todo en el primer bloque
    }
    engine_.prepare(44100.0);
    if (wrapperType == wrapperType_Standalone) {
        standaloneMidi_ = std::make_unique<StandaloneMidi>();
    }
}

juce::AudioProcessorValueTreeState::ParameterLayout AcidProcessor::createLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    for (int i = 0; i < ac::NumParams; ++i) {
        const auto& info = ac::paramInfo(i);
        const juce::ParameterID pid { info.id, 1 };
        if (info.choices > 0) {
            layout.add(std::make_unique<juce::AudioParameterChoice>(
                pid, info.name, juce::StringArray::fromTokens(info.labels, "|", ""), int(info.def)));
        } else {
            // Como el original: escala de 0 a 10 (la afinacion, de -5 a +5)
            const bool bipolar = i == ac::Tune;
            layout.add(std::make_unique<juce::AudioParameterFloat>(
                pid, info.name, juce::NormalisableRange<float>(0.f, 1.f, 1.f / 200.f), info.def,
                juce::AudioParameterFloatAttributes().withStringFromValueFunction(
                    [bipolar](float v, int) { return juce::String(bipolar ? (v - 0.5f) * 10.f : v * 10.f, 1); })));
        }
    }
    return layout;
}

void AcidProcessor::prepareToPlay(double sampleRate, int)
{
    engine_.prepare(sampleRate);
    for (auto& a : applied_)
        a = std::nanf("");
}

bool AcidProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

void AcidProcessor::syncParams()
{
    for (int i = 0; i < ac::NumParams; ++i) {
        const float v = params_[size_t(i)]->load();
        if (!(v == applied_[size_t(i)])) {
            applied_[size_t(i)] = v;
            engine_.setParam(i, v);
        }
    }
}

void AcidProcessor::handleMidi(const juce::MidiMessage& m)
{
    if (m.isNoteOn()) {
        engine_.noteOn(m.getNoteNumber(), m.getFloatVelocity());
        accentLit.store(m.getFloatVelocity() >= params_[size_t(ac::AccentVel)]->load());
    }
    else if (m.isNoteOff())
        engine_.noteOff(m.getNoteNumber());
    else if (m.isAllNotesOff() || m.isAllSoundOff())
        engine_.allNotesOff();
    else if (m.isPitchWheel())
        engine_.setBend(float(m.getPitchWheelValue() - 8192) / 8192.f);
}

void AcidProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    buffer.clear();
    if (buffer.getNumChannels() < 2)
        return;
    syncParams();
    keyboardState.processNextMidiBuffer(midi, 0, n, true);
    const float ub = uiBend_.load();
    if (ub != lastUiBend_) { lastUiBend_ = ub; engine_.setBend(ub); }

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
    gate.store(engine_.gate());
}

juce::AudioProcessorEditor* AcidProcessor::createEditor()
{
    return new AcidEditor(*this);
}

int AcidProcessor::getNumPrograms() { return int(ac::presets().size()); }

const juce::String AcidProcessor::getProgramName(int index)
{
    const auto& list = ac::presets();
    return index >= 0 && index < int(list.size()) ? juce::String(list[size_t(index)].name) : juce::String();
}

void AcidProcessor::setCurrentProgram(int index)
{
    const auto& list = ac::presets();
    if (index < 0 || index >= int(list.size()))
        return;
    program_ = index;
    for (int i = 0; i < ac::NumParams; ++i) {
        const auto& info = ac::paramInfo(i);
        float value = info.def;
        for (const auto& pv : list[size_t(index)].values)
            if (pv.id == i)
                value = pv.value;
        if (auto* p = apvts.getParameter(info.id))
            p->setValueNotifyingHost(info.choices > 0 ? value / float(info.choices - 1) : value);
    }
}

void AcidProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    state.setProperty("program", program_, nullptr);
    if (auto xml = state.createXml())
        copyXmlToBinary(*xml, destData);
}

void AcidProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary(data, sizeInBytes))
        if (xml->hasTagName(apvts.state.getType())) {
            apvts.replaceState(juce::ValueTree::fromXml(*xml));
            program_ = int(apvts.state.getProperty("program", 0));
        }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new AcidProcessor();
}
