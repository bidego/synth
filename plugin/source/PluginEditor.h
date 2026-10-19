#pragma once
#include <memory>
#include <vector>
#include <juce_audio_utils/juce_audio_utils.h>
#include "JunoLookAndFeel.h"
#include "PluginProcessor.h"

/** Un deslizador del panel: el capuchon, la escala 0-10 al costado y el nombre abajo. */
class PanelSlider : public juce::Component {
public:
    PanelSlider(JunoProcessor& p, int paramId, juce::LookAndFeel& laf);
    void paint(juce::Graphics&) override;
    void resized() override;

private:
    juce::Slider slider_;
    juce::String label_;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> attachment_;
};

/** Un interruptor de varias posiciones: una fila de botones con su nombre arriba. */
class PanelSwitch : public juce::Component {
public:
    PanelSwitch(JunoProcessor& p, int paramId, juce::LookAndFeel& laf);
    int idealWidth() const { return width_; }
    void paint(juce::Graphics&) override;
    void resized() override;

private:
    void update(float index);

    juce::String label_;
    std::vector<std::unique_ptr<juce::TextButton>> buttons_;
    std::unique_ptr<juce::ParameterAttachment> attachment_;
    int width_ = 0;
};

class JunoEditor : public juce::AudioProcessorEditor, private juce::Timer {
public:
    explicit JunoEditor(JunoProcessor&);
    ~JunoEditor() override;

    void paint(juce::Graphics&) override {}
    void resized() override;

    // El panel se dibuja siempre a este tamano y se escala al de la ventana
    static constexpr int kWidth = 1140, kHeight = 640;

private:
    class Content;
    void timerCallback() override;

    JunoLookAndFeel laf_;
    juce::ComponentBoundsConstrainer constrainer_;
    std::unique_ptr<Content> content_;
};
