#pragma once
#include <array>
#include <atomic>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include "md_engine.h"

/** En la aplicacion independiente abre solos los controladores MIDI (tambien los que se enchufen despues). */
class StandaloneMidi : private juce::MidiInputCallback, private juce::Timer {
public:
    explicit StandaloneMidi(juce::MidiMessageCollector& collector);
    ~StandaloneMidi() override;

private:
    void timerCallback() override { rescan(); }
    void rescan();
    void handleIncomingMidiMessage(juce::MidiInput*, const juce::MidiMessage& message) override { collector_.addMessageToQueue(message); }

    juce::MidiMessageCollector& collector_;
    std::vector<std::unique_ptr<juce::MidiInput>> inputs_;
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
    juce::MidiMessageCollector midiCollector_;
    std::unique_ptr<StandaloneMidi> standaloneMidi_;
    std::atomic<float> uiBend_ { 0.f }, uiMod_ { 0.f };
    float lastUiBend_ = 0.f, lastUiMod_ = 0.f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ModelDProcessor)
};
