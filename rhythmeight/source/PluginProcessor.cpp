#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <cmath>
#include <cstring>

RhythmEightProcessor::RhythmEightProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "RHYTHMEIGHT", createLayout())
{
    for (int i = 0; i < re::NumParams; ++i) {
        params_[size_t(i)] = apvts.getRawParameterValue(re::paramInfo(i).id);
        applied_[size_t(i)] = std::nanf("");   // fuerza a cargar todo en el primer bloque
    }
    for (auto& s : pattern_)
        s.store(0);
    appliedPattern_.fill(0xff);   // idem para el patron
    engine_.prepare(44100.0);
    if (wrapperType == wrapperType_Standalone) {
        standaloneMidi_ = std::make_unique<StandaloneMidi>();
    }
    setCurrentProgram(0);   // arranca con el primer sonido (parametros y patron)
}

juce::AudioProcessorValueTreeState::ParameterLayout RhythmEightProcessor::createLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    for (int i = 0; i < re::NumParams; ++i) {
        const auto& info = re::paramInfo(i);
        const juce::ParameterID pid { info.id, 1 };
        if (info.choices > 0) {
            layout.add(std::make_unique<juce::AudioParameterChoice>(
                pid, info.name, juce::StringArray::fromTokens(info.labels, "|", ""), int(info.def)));
        } else if (i == re::Tempo) {
            // El tempo propio, en pulsos por minuto
            layout.add(std::make_unique<juce::AudioParameterFloat>(
                pid, info.name, juce::NormalisableRange<float>(0.f, 1.f, 1.f / 200.f), info.def,
                juce::AudioParameterFloatAttributes().withStringFromValueFunction(
                    [](float v, int) { return juce::String(juce::roundToInt(40.f + 200.f * v)) + " BPM"; })));
        } else {
            // Escala de 0 a 10 como los diales del original
            layout.add(std::make_unique<juce::AudioParameterFloat>(
                pid, info.name, juce::NormalisableRange<float>(0.f, 1.f, 1.f / 200.f), info.def,
                juce::AudioParameterFloatAttributes().withStringFromValueFunction(
                    [](float v, int) { return juce::String(v * 10.f, 1); })));
        }
    }
    return layout;
}

void RhythmEightProcessor::prepareToPlay(double sampleRate, int)
{
    engine_.prepare(sampleRate);
    for (auto& a : applied_)
        a = std::nanf("");
    appliedPattern_.fill(0xff);   // prepare() no borra el patron, pero se recarga por las dudas
}

bool RhythmEightProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

void RhythmEightProcessor::syncParams()
{
    for (int i = 0; i < re::NumParams; ++i) {
        const float v = params_[size_t(i)]->load();
        if (!(v == applied_[size_t(i)])) {
            applied_[size_t(i)] = v;
            engine_.setParam(i, v);
        }
    }
}

void RhythmEightProcessor::syncPattern()
{
    for (int inst = 0; inst < re::kInst; ++inst)
        for (int s = 0; s < re::kSteps; ++s) {
            const size_t k = size_t(slot(inst, s));
            const uint8_t v = pattern_[k].load();
            if (v != appliedPattern_[k]) {
                appliedPattern_[k] = v;
                engine_.setStep(inst, s, v);
            }
        }
}

void RhythmEightProcessor::handleMidi(const juce::MidiMessage& m)
{
    if (m.isNoteOn())
        engine_.noteOn(m.getNoteNumber(), m.getFloatVelocity());
    else if (m.isAllNotesOff() || m.isAllSoundOff())
        engine_.allNotesOff();
}

void RhythmEightProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    buffer.clear();
    if (buffer.getNumChannels() < 2)
        return;
    syncParams();
    syncPattern();

    // Con Sync = Host el secuenciador sigue el transporte del anfitrion
    if (params_[size_t(re::Sync)]->load() >= 0.5f) {
        bool playing = false;
        double ppq = 0.0, tempo = 120.0;
        if (auto* head = getPlayHead())
            if (const auto pos = head->getPosition()) {
                playing = pos->getIsPlaying();
                ppq = pos->getPpqPosition().orFallback(0.0);
                tempo = pos->getBpm().orFallback(120.0);
            }
        engine_.setTransport(playing, ppq, tempo);
    }

    // Golpes pedidos desde la interfaz
    const uint32_t hits = pendingHits_.exchange(0);
    for (int i = 0; i < re::kInst; ++i)
        if (hits & (1u << i))
            engine_.trigger(i, 0.9, false);

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
    currentStep.store(engine_.currentStep());
    patternLength.store(engine_.stepLength());
    bpm.store(float(engine_.bpm()));
}

juce::AudioProcessorEditor* RhythmEightProcessor::createEditor()
{
    return new RhythmEightEditor(*this);
}

void RhythmEightProcessor::setStep(int inst, int step, int value)
{
    if (inst < 0 || inst >= re::kInst || step < 0 || step >= re::kSteps)
        return;
    pattern_[size_t(slot(inst, step))].store(uint8_t(juce::jlimit(0, 2, value)));
    revision_.fetch_add(1);
}

void RhythmEightProcessor::triggerFromUi(int inst)
{
    if (inst >= 0 && inst < re::kInst)
        pendingHits_.fetch_or(1u << inst);
}

juce::String RhythmEightProcessor::patternToString() const
{
    juce::StringArray rows;
    for (int inst = 0; inst < re::kInst; ++inst) {
        juce::String row;
        for (int s = 0; s < re::kSteps; ++s) {
            const int v = getStep(inst, s);
            row += v == 2 ? 'X' : v == 1 ? 'x' : '.';
        }
        rows.add(row);
    }
    return rows.joinIntoString("|");
}

void RhythmEightProcessor::patternFromString(const juce::String& text)
{
    const auto rows = juce::StringArray::fromTokens(text, "|", "");
    for (int inst = 0; inst < re::kInst; ++inst) {
        const juce::String row = inst < rows.size() ? rows[inst] : juce::String();
        for (int s = 0; s < re::kSteps; ++s) {
            const juce::juce_wchar c = s < row.length() ? row[s] : '.';
            pattern_[size_t(slot(inst, s))].store(uint8_t(c == 'X' ? 2 : c == 'x' ? 1 : 0));
        }
    }
    revision_.fetch_add(1);
}

int RhythmEightProcessor::getNumPrograms() { return int(re::presets().size()); }

const juce::String RhythmEightProcessor::getProgramName(int index)
{
    const auto& list = re::presets();
    return index >= 0 && index < int(list.size()) ? juce::String(list[size_t(index)].name) : juce::String();
}

void RhythmEightProcessor::setCurrentProgram(int index)
{
    const auto& list = re::presets();
    if (index < 0 || index >= int(list.size()))
        return;
    program_ = index;
    const auto& preset = list[size_t(index)];
    for (int i = 0; i < re::NumParams; ++i) {
        if (i == re::Run || i == re::Sync)   // como engine.loadPreset: el estado de marcha y la sincronia no cambian con el sonido
            continue;
        const auto& info = re::paramInfo(i);
        float value = info.def;
        for (const auto& pv : preset.values)
            if (pv.id == i)
                value = pv.value;
        if (auto* p = apvts.getParameter(info.id))
            p->setValueNotifyingHost(info.choices > 1 ? value / float(info.choices - 1) : value);
    }
    // El patron del sonido (16 caracteres por voz: '.', 'x', 'X')
    for (int inst = 0; inst < re::kInst; ++inst) {
        const char* row = preset.pattern[inst];
        const int len = row ? int(std::strlen(row)) : 0;
        for (int s = 0; s < re::kSteps; ++s) {
            const char c = s < len ? row[s] : '.';
            pattern_[size_t(slot(inst, s))].store(uint8_t(c == 'X' ? 2 : c == 'x' ? 1 : 0));
        }
    }
    revision_.fetch_add(1);
}

void RhythmEightProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    state.setProperty("program", program_, nullptr);
    state.setProperty("pattern", patternToString(), nullptr);
    if (auto xml = state.createXml())
        copyXmlToBinary(*xml, destData);
}

void RhythmEightProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary(data, sizeInBytes))
        if (xml->hasTagName(apvts.state.getType())) {
            apvts.replaceState(juce::ValueTree::fromXml(*xml));
            program_ = int(apvts.state.getProperty("program", 0));
            if (apvts.state.hasProperty("pattern"))
                patternFromString(apvts.state.getProperty("pattern").toString());
        }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new RhythmEightProcessor();
}
