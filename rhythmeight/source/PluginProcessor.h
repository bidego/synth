#pragma once
#include <array>
#include <atomic>
#include <cstdint>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include "re_engine.h"

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

/** Rhythm Eight como plugin (VST3 / AU / Standalone): una capa fina sobre el motor de engine/. */
class RhythmEightProcessor : public juce::AudioProcessor {
public:
    RhythmEightProcessor();
    ~RhythmEightProcessor() override = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "Rhythm Eight"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 3.0; }

    int getNumPrograms() override;
    int getCurrentProgram() override { return program_; }
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    juce::AudioProcessorValueTreeState apvts;

    // --- Para la interfaz (hilo de mensajes) ---
    /** Valor de un paso: 0 vacio, 1 golpe, 2 acento. */
    int getStep(int inst, int step) const { return pattern_[slot(inst, step)].load(); }
    void setStep(int inst, int step, int value);
    /** Se incrementa con cada cambio del patron (para que la interfaz sepa cuando redibujar). */
    int patternRevision() const { return revision_.load(); }
    /** Dispara una voz desde la interfaz: se encola y suena en el proximo bloque. */
    void triggerFromUi(int inst);

    std::atomic<int> currentStep { -1 };      // paso que sono por ultima vez (-1 = parado)
    std::atomic<int> patternLength { 16 };    // largo del patron en pasos
    std::atomic<float> bpm { 120.f };         // tempo efectivo (propio o del anfitrion)

private:
    static int slot(int inst, int step) { return inst * re::kSteps + step; }
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();
    void syncParams();
    void syncPattern();
    void handleMidi(const juce::MidiMessage& m);
    juce::String patternToString() const;
    void patternFromString(const juce::String& s);

    re::Engine engine_;
    std::array<std::atomic<float>*, re::NumParams> params_ {};
    std::array<float, re::NumParams> applied_ {};
    // Patron compartido: la interfaz escribe, processBlock lo aplica al motor cuando cambia
    std::array<std::atomic<uint8_t>, re::kInst * re::kSteps> pattern_ {};
    std::array<uint8_t, re::kInst * re::kSteps> appliedPattern_ {};
    std::atomic<int> revision_ { 0 };
    std::atomic<uint32_t> pendingHits_ { 0 };   // bit i = golpe de la voz i pedido desde la interfaz
    int program_ = 0;
    juce::MidiMessageCollector midiCollector_;
    std::unique_ptr<StandaloneMidi> standaloneMidi_;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(RhythmEightProcessor)
};
