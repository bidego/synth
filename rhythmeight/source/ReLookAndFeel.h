#pragma once
#include <juce_audio_utils/juce_audio_utils.h>

/** El aspecto de Rhythm Eight: chasis de carbon, serigrafia clara, perillas crema con marca y botones de color. */
class ReLookAndFeel : public juce::LookAndFeel_V4 {
public:
    static constexpr float kStart = 1.25f * juce::MathConstants<float>::pi;
    static constexpr float kEnd = 2.75f * juce::MathConstants<float>::pi;

    static juce::Colour white() { return juce::Colour(0xffeeeadc); }
    static juce::Colour dim() { return juce::Colour(0xff9c9a90); }
    static juce::Colour red() { return juce::Colour(0xffe03a2c); }
    static juce::Colour orange() { return juce::Colour(0xffec8a2c); }
    static juce::Colour yellow() { return juce::Colour(0xffe9c933); }
    static juce::Colour cream() { return juce::Colour(0xfff1ead2); }

    /** Color de los botones de pasos segun el grupo de cuatro: rojo, naranja, amarillo y crema. */
    static juce::Colour groupColour(int group)
    {
        switch (group & 3) {
            case 0: return red();
            case 1: return orange();
            case 2: return yellow();
            default: return cream();
        }
    }

    static juce::Font bold(float h, const char* face = "Helvetica Neue")
    {
        return juce::Font(juce::FontOptions(face, h, juce::Font::bold));
    }

    ReLookAndFeel()
    {
        setColour(juce::ComboBox::backgroundColourId, juce::Colour(0xff1b1c1e));
        setColour(juce::ComboBox::textColourId, white());
        setColour(juce::ComboBox::outlineColourId, juce::Colour(0xff5a5b5c));
        setColour(juce::ComboBox::arrowColourId, dim());
        setColour(juce::PopupMenu::backgroundColourId, juce::Colour(0xff1b1c1e));
        setColour(juce::PopupMenu::textColourId, white());
        setColour(juce::PopupMenu::headerTextColourId, orange());
        setColour(juce::PopupMenu::highlightedBackgroundColourId, orange());
        setColour(juce::PopupMenu::highlightedTextColourId, juce::Colours::black);
        setColour(juce::TooltipWindow::backgroundColourId, juce::Colour(0xff1b1c1e));
        setColour(juce::TooltipWindow::textColourId, white());
    }

    // --- Perillas: falda oscura, tapa crema con brillo y una marca oscura hasta el borde ---
    void drawRotarySlider(juce::Graphics& g, int x, int y, int w, int h, float pos, float startAngle, float endAngle, juce::Slider& s) override
    {
        const auto area = juce::Rectangle<float>(float(x), float(y), float(w), float(h)).reduced(2.f);
        const float r = juce::jmin(area.getWidth(), area.getHeight()) * 0.5f;
        const auto c = area.getCentre();
        const auto circle = juce::Rectangle<float>(r * 2.f, r * 2.f).withCentre(c);

        g.setColour(juce::Colours::black.withAlpha(0.55f));
        g.fillEllipse(circle.translated(1.2f, 2.8f).expanded(0.8f));
        // Falda
        g.setGradientFill(juce::ColourGradient(juce::Colour(0xff6c6d70), c.x - r * 0.5f, c.y - r * 0.6f, juce::Colour(0xff151618), c.x + r * 0.7f, c.y + r * 0.8f, true));
        g.fillEllipse(circle);
        g.setColour(juce::Colour(0xff050506));
        g.drawEllipse(circle, 1.1f);
        // Tapa crema
        const auto face = circle.reduced(r * 0.16f);
        g.setGradientFill(juce::ColourGradient(juce::Colour(0xfffbf6e4), c.x - r * 0.4f, c.y - r * 0.5f, juce::Colour(0xffbdb492), c.x + r * 0.5f, c.y + r * 0.6f, true));
        g.fillEllipse(face);
        g.setColour(juce::Colours::white.withAlpha(0.45f));
        juce::Path rim;
        rim.addCentredArc(c.x, c.y, face.getWidth() * 0.5f - 1.f, face.getHeight() * 0.5f - 1.f, 0.f, -2.5f, 0.6f, true);
        g.strokePath(rim, juce::PathStrokeType(1.f));
        g.setColour(juce::Colour(0xff4b4636));
        g.drawEllipse(face, 0.9f);
        // Marca
        const float a = startAngle + pos * (endAngle - startAngle);
        const float s0 = std::sin(a), c0 = -std::cos(a);
        g.setColour(s.isMouseOverOrDragging() ? juce::Colour(0xffc2261a) : juce::Colour(0xff1d1b16));
        g.drawLine(c.x + s0 * r * 0.2f, c.y + c0 * r * 0.2f, c.x + s0 * r * 0.84f, c.y + c0 * r * 0.84f, 2.4f);
    }

    // --- Boton RUN: pastilla con un LED rojo que se enciende ---
    void drawToggleButton(juce::Graphics& g, juce::ToggleButton& b, bool highlighted, bool) override
    {
        const auto r = b.getLocalBounds().toFloat().reduced(0.5f);
        const bool on = b.getToggleState();
        g.setGradientFill(juce::ColourGradient::vertical(on ? juce::Colour(0xff3a1612) : highlighted ? juce::Colour(0xff3b3c3f) : juce::Colour(0xff2b2c2f), r.getY(),
                                                         juce::Colour(0xff111213), r.getBottom()));
        g.fillRoundedRectangle(r, 4.f);
        g.setColour(on ? red() : juce::Colour(0xff6a6b6c));
        g.drawRoundedRectangle(r, 4.f, 1.2f);
        const auto led = juce::Rectangle<float>(10.f, 10.f).withCentre({ r.getX() + 15.f, r.getCentreY() });
        if (on) {
            g.setColour(red().withAlpha(0.4f));
            g.fillEllipse(led.expanded(4.f));
        }
        g.setColour(on ? juce::Colour(0xffff5a45) : juce::Colour(0xff451a14));
        g.fillEllipse(led);
        g.setColour(juce::Colours::black);
        g.drawEllipse(led, 1.f);
        g.setColour(white());
        g.setFont(bold(13.f));
        g.drawText(on ? "RUN" : "STOP", b.getLocalBounds().withTrimmedLeft(26), juce::Justification::centred);
    }

    // --- Botones del selector de sonidos ---
    juce::Font getTextButtonFont(juce::TextButton&, int) override { return bold(12.f); }

    void drawButtonBackground(juce::Graphics& g, juce::Button& b, const juce::Colour&, bool highlighted, bool down) override
    {
        const auto r = b.getLocalBounds().toFloat().reduced(0.5f);
        g.setGradientFill(juce::ColourGradient::vertical(down ? juce::Colour(0xff0f1011) : highlighted ? juce::Colour(0xff3b3c3f) : juce::Colour(0xff2b2c2f), r.getY(),
                                                         juce::Colour(0xff121314), r.getBottom()));
        g.fillRoundedRectangle(r, 3.f);
        g.setColour(highlighted ? juce::Colour(0xffa09e94) : juce::Colour(0xff5a5b5c));
        g.drawRoundedRectangle(r, 3.f, 1.f);
    }

    void drawButtonText(juce::Graphics& g, juce::TextButton& b, bool, bool) override
    {
        g.setFont(getTextButtonFont(b, b.getHeight()));
        g.setColour(white());
        g.drawText(b.getButtonText(), b.getLocalBounds(), juce::Justification::centred);
    }

    juce::Font getComboBoxFont(juce::ComboBox&) override { return bold(13.f); }
    juce::Font getPopupMenuFont() override { return juce::Font(juce::FontOptions(13.f)); }
};
