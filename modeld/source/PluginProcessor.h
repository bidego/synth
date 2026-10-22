#pragma once
#include <array>
#include <atomic>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include "md_engine.h"

/** Tilda los controladores MIDI nuevos en la app independiente (definida en StandaloneMidi.cpp; en los demas formatos no hace nada). */
void standaloneAutoEnableMidi(juce::StringArray& known, bool& loaded);

/**
 * En la aplicacion independiente JUCE no abre ningun controlador MIDI por su cuenta: hay que tildarlos en Options > Audio/MIDI Settings.
 * Esto los tilda solo, UNA vez por controlador (la lista de los ya vistos se guarda con los ajustes de la app, tambien para los que se
 * enchufen despues), y desde ahi manda Options: si lo destildas, queda destildado. Los mensajes los entrega JUCE al procesador.
 */
class StandaloneMidi : private juce::Timer {
public:
    StandaloneMidi() { startTimer(1000); }
    ~StandaloneMidi() override { stopTimer(); }

private:
    void timerCallback() override { standaloneAutoEnableMidi(known_, loaded_); }

    bool loaded_ = false;
    juce::StringArray known_;
};

/** Model D como plugin (VST3 / AU / Standalone): una capa fina sobre el motor de engine/. */
class ModelDProcessor : public juce::AudioProcessor {
public:
    ModelDProcessor();
    ~ModelDProcessor() override = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "Model D"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 10.0; }

    int getNumPrograms() override;
    int getCurrentProgram() override { return program_; }
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    juce::AudioProcessorValueTreeState apvts;

    // Para la interfaz: teclado en pantalla, rueda de tono y el gate
    juce::MidiKeyboardState keyboardState;
    std::atomic<bool> gate { false };
    void setUiBend(float v) { uiBend_.store(v); }
    void setUiMod(float v) { uiMod_.store(v); }

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();
    void syncParams();
    void handleMidi(const juce::MidiMessage& m);

    md::Engine engine_;
    std::array<std::atomic<float>*, md::NumParams> params_ {};
    std::array<float, md::NumParams> applied_ {};
    int program_ = 0;
    std::unique_ptr<StandaloneMidi> standaloneMidi_;
    std::atomic<float> uiBend_ { 0.f }, uiMod_ { 0.f };
    float lastUiBend_ = 0.f, lastUiMod_ = 0.f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ModelDProcessor)
};
