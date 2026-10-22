#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <cmath>

JunoProcessor::JunoProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "JUNO106", createLayout())
{
    for (int i = 0; i < juno::NumParams; ++i) {
        params_[size_t(i)] = apvts.getRawParameterValue(juno::paramInfo(i).id);
        applied_[size_t(i)] = std::nanf("");   // fuerza a cargar todo en el primer bloque
    }
    engine_.prepare(44100.0);
    // Como instrumento dentro de una DAW el MIDI lo entrega el anfitrion; solo la app independiente lo abre ella misma
    if (wrapperType == wrapperType_Standalone) {
        standaloneMidi_ = std::make_unique<StandaloneMidi>();
    }
}

juce::AudioProcessorValueTreeState::ParameterLayout JunoProcessor::createLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    for (int i = 0; i < juno::NumParams; ++i) {
        const auto& info = juno::paramInfo(i);
        const juce::ParameterID pid { info.id, 1 };
        if (info.choices > 0) {
            layout.add(std::make_unique<juce::AudioParameterChoice>(
                pid, info.name, juce::StringArray::fromTokens(info.labels, "|", ""), int(info.def)));
        } else {
            // Como el original: la escala va de 0 a 10
            layout.add(std::make_unique<juce::AudioParameterFloat>(
                pid, info.name, juce::NormalisableRange<float>(0.f, 1.f, 1.f / 127.f), info.def,
                juce::AudioParameterFloatAttributes().withStringFromValueFunction(
                    [](float v, int) { return juce::String(v * 10.f, 1); })));
        }
    }
    return layout;
}

void JunoProcessor::prepareToPlay(double sampleRate, int)
{
    engine_.prepare(sampleRate);
    for (auto& a : applied_)
        a = std::nanf("");
}

bool JunoProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

void JunoProcessor::syncParams()
{
    for (int i = 0; i < juno::NumParams; ++i) {
        const float v = params_[size_t(i)]->load();
        // Solo se tocan los que cambiaron (algunos recalculan coeficientes)
        if (!(v == applied_[size_t(i)])) {
            applied_[size_t(i)] = v;
            engine_.setParam(i, v);
        }
    }
}

void JunoProcessor::handleMidi(const juce::MidiMessage& m)
{
    if (m.isNoteOn())
        engine_.noteOn(m.getNoteNumber(), m.getFloatVelocity());
    else if (m.isNoteOff())
        engine_.noteOff(m.getNoteNumber());
    else if (m.isAllNotesOff() || m.isAllSoundOff())
        engine_.allNotesOff();
    else if (m.isPitchWheel())
        engine_.setBend(float(m.getPitchWheelValue() - 8192) / 8192.f);
    else if (m.isController()) {
        if (m.getControllerNumber() == 1)
            engine_.setModWheel(float(m.getControllerValue()) / 127.f);
        else if (m.getControllerNumber() == 64)
            engine_.sustainPedal(m.getControllerValue() >= 64);
    }
}

void JunoProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    buffer.clear();
    if (buffer.getNumChannels() < 2)
        return;
    syncParams();
    // El teclado en pantalla y las ruedas de la interfaz
    keyboardState.processNextMidiBuffer(midi, 0, n, true);
    const float ub = uiBend_.load(), um = uiMod_.load();
    if (ub != lastUiBend_) { lastUiBend_ = ub; engine_.setBend(ub); }
    if (um != lastUiMod_) { lastUiMod_ = um; engine_.setModWheel(um); }

    float* left = buffer.getWritePointer(0);
    float* right = buffer.getWritePointer(1);
    int pos = 0;
    // Cada mensaje MIDI cae en su muestra exacta: se genera el audio hasta ahi y despues se aplica
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

juce::AudioProcessorEditor* JunoProcessor::createEditor()
{
    return new JunoEditor(*this);
}

int JunoProcessor::getNumPrograms() { return int(juno::presets().size()); }

const juce::String JunoProcessor::getProgramName(int index)
{
    const auto& list = juno::presets();
    return index >= 0 && index < int(list.size()) ? juce::String(list[size_t(index)].name) : juce::String();
}

void JunoProcessor::setCurrentProgram(int index)
{
    const auto& list = juno::presets();
    if (index < 0 || index >= int(list.size()))
        return;
    program_ = index;
    for (int i = 0; i < juno::NumParams; ++i) {
        const auto& info = juno::paramInfo(i);
        float value = info.def;
        for (const auto& pv : list[size_t(index)].values)
            if (pv.id == i)
                value = pv.value;
        if (auto* p = apvts.getParameter(info.id))
            p->setValueNotifyingHost(info.choices > 0 ? value / float(info.choices - 1) : value);
    }
}

void JunoProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    state.setProperty("program", program_, nullptr);
    if (auto xml = state.createXml())
        copyXmlToBinary(*xml, destData);
}

void JunoProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary(data, sizeInBytes))
        if (xml->hasTagName(apvts.state.getType())) {
            apvts.replaceState(juce::ValueTree::fromXml(*xml));
            program_ = int(apvts.state.getProperty("program", 0));
        }
}

// El anfitrion crea el plugin con esta funcion
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new JunoProcessor();
}
