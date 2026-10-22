#pragma once
#include <memory>
#include <vector>
#include <juce_audio_utils/juce_audio_utils.h>
#include "PluginProcessor.h"
#include "ReLookAndFeel.h"

/** Una perilla del panel: la tapa, las marcas alrededor y el nombre debajo. */
class ReKnob : public juce::Component {
public:
    ReKnob(RhythmEightProcessor& p, int paramId, const juce::String& label, juce::LookAndFeel& laf);
    ~ReKnob() override { slider_.setLookAndFeel(nullptr); }
    void paint(juce::Graphics&) override;
    void resized() override;

    static constexpr int kW = 72, kH = 84;

private:
    juce::Slider slider_;
    juce::String label_;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> attachment_;
};

/** La rejilla de pasos: 13 instrumentos x 16 columnas, con el rotulo de cada voz (dispara el golpe) y el indicador del paso actual. */
class StepGrid : public juce::Component {
public:
    explicit StepGrid(RhythmEightProcessor& p) : proc_(p) {}
    void paint(juce::Graphics&) override;
    void mouseDown(const juce::MouseEvent&) override;
    void mouseDrag(const juce::MouseEvent&) override;
    void mouseUp(const juce::MouseEvent&) override { flash_ = -1; repaint(); }

    static constexpr int kLabelW = 112, kCellX = 132, kPitch = 68, kCellW = 60, kGroupGap = 14;
    static constexpr int kTop = 34, kRowPitch = 30, kCellH = 25;
    static int cellX(int step) { return kCellX + step * kPitch + (step / 4) * kGroupGap; }
    static int rowY(int inst) { return kTop + inst * kRowPitch; }
    static constexpr int kGridH = kTop + re::kInst * kRowPitch;

private:
    bool cellAt(juce::Point<int> p, int& inst, int& step) const;

    RhythmEightProcessor& proc_;
    int paintValue_ = 1, lastInst_ = -1, lastStep_ = -1, flash_ = -1;
};

class RhythmEightEditor : public juce::AudioProcessorEditor, private juce::Timer {
public:
    explicit RhythmEightEditor(RhythmEightProcessor&);
    ~RhythmEightEditor() override;

    void paint(juce::Graphics&) override {}
    void resized() override;

    // El panel se dibuja siempre a este tamano y se escala al de la ventana
    static constexpr int kWidth = 1400, kHeight = 790;

private:
    class Content;
    void timerCallback() override;

    ReLookAndFeel laf_;
    juce::ComponentBoundsConstrainer constrainer_;
    std::unique_ptr<Content> content_;
};
