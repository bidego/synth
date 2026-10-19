#pragma once
#include <juce_gui_basics/juce_gui_basics.h>

/** El aspecto del panel del Juno-106: ranuras negras, capuchones grises con una marca blanca y botones rojos. */
class JunoLookAndFeel : public juce::LookAndFeel_V4 {
public:
    static juce::Colour panel() { return juce::Colour(0xff2c2d31); }
    static juce::Colour ink() { return juce::Colour(0xfff4f4ee); }
    static juce::Colour dim() { return juce::Colour(0xffc9c9c4); }
    static juce::Colour red() { return juce::Colour(0xffd8402a); }

    JunoLookAndFeel()
    {
        setColour(juce::ComboBox::backgroundColourId, juce::Colour(0xff1b1c1f));
        setColour(juce::ComboBox::textColourId, ink());
        setColour(juce::ComboBox::outlineColourId, juce::Colour(0xff5a5b5f));
        setColour(juce::ComboBox::arrowColourId, dim());
        setColour(juce::PopupMenu::backgroundColourId, juce::Colour(0xff1b1c1f));
        setColour(juce::PopupMenu::textColourId, ink());
        setColour(juce::PopupMenu::headerTextColourId, juce::Colour(0xffee8a1d));
        setColour(juce::PopupMenu::highlightedBackgroundColourId, red());
        setColour(juce::PopupMenu::highlightedTextColourId, juce::Colours::white);
        setColour(juce::TooltipWindow::backgroundColourId, juce::Colour(0xff1b1c1f));
        setColour(juce::TooltipWindow::textColourId, ink());
    }

    int getSliderThumbRadius(juce::Slider&) override { return 9; }

    void drawLinearSlider(juce::Graphics& g, int x, int y, int width, int height, float sliderPos, float, float,
                          juce::Slider::SliderStyle style, juce::Slider& slider) override
    {
        if (style != juce::Slider::LinearVertical) {
            LookAndFeel_V4::drawLinearSlider(g, x, y, width, height, sliderPos, 0, 0, style, slider);
            return;
        }
        const float cx = float(x) + float(width) * 0.5f;
        const float top = float(y) + 9.f, bottom = float(y + height) - 9.f;
        // Ranura
        const juce::Rectangle<float> slot(cx - 3.f, top - 2.f, 6.f, bottom - top + 4.f);
        g.setColour(juce::Colour(0xff050506));
        g.fillRoundedRectangle(slot, 1.5f);
        g.setColour(juce::Colour(0xff5a5b5f));
        g.drawRoundedRectangle(slot.expanded(0.5f), 1.5f, 1.f);
        // Capuchon
        const juce::Rectangle<float> cap(cx - 13.f, sliderPos - 8.f, 26.f, 16.f);
        g.setColour(juce::Colours::black.withAlpha(0.45f));
        g.fillRoundedRectangle(cap.translated(0.f, 2.f), 2.f);
        g.setGradientFill(juce::ColourGradient::vertical(juce::Colour(0xff8c8d92), cap.getY(), juce::Colour(0xff3a3b3f), cap.getBottom()));
        g.fillRoundedRectangle(cap, 2.f);
        g.setColour(juce::Colour(0xff1a1a1c));
        g.drawRoundedRectangle(cap, 2.f, 1.f);
        g.setColour(juce::Colours::white.withAlpha(0.3f));
        g.drawLine(cap.getX() + 2.f, cap.getY() + 1.5f, cap.getRight() - 2.f, cap.getY() + 1.5f, 1.f);
        g.setColour(slider.isMouseOverOrDragging() ? juce::Colour(0xffff9a7e) : ink());
        g.fillRect(cap.getX() + 4.f, cap.getCentreY() - 1.f, cap.getWidth() - 8.f, 2.f);
    }

    juce::Font getTextButtonFont(juce::TextButton&, int) override { return juce::Font(juce::FontOptions(11.f, juce::Font::bold)); }

    void drawButtonBackground(juce::Graphics& g, juce::Button& b, const juce::Colour&, bool highlighted, bool) override
    {
        const auto r = b.getLocalBounds().toFloat().reduced(0.5f);
        const bool on = b.getToggleState();
        if (on) {
            g.setColour(red().withAlpha(0.35f));
            g.fillRoundedRectangle(r.expanded(1.5f), 3.f);
            g.setGradientFill(juce::ColourGradient::vertical(juce::Colour(0xffec5a40), r.getY(), juce::Colour(0xffb8331f), r.getBottom()));
        } else {
            g.setGradientFill(juce::ColourGradient::vertical(highlighted ? juce::Colour(0xff2c2d31) : juce::Colour(0xff222326), r.getY(),
                                                             juce::Colour(0xff151618), r.getBottom()));
        }
        g.fillRoundedRectangle(r, 2.5f);
        g.setColour(on ? juce::Colour(0xffff7a5e) : highlighted ? juce::Colour(0xff8c8d92) : juce::Colour(0xff5a5b5f));
        g.drawRoundedRectangle(r, 2.5f, 1.f);
    }

    void drawButtonText(juce::Graphics& g, juce::TextButton& b, bool, bool) override
    {
        g.setFont(getTextButtonFont(b, b.getHeight()));
        g.setColour(b.getToggleState() ? juce::Colours::white : dim());
        g.drawText(b.getButtonText(), b.getLocalBounds(), juce::Justification::centred);
    }

    juce::Font getComboBoxFont(juce::ComboBox&) override { return juce::Font(juce::FontOptions(13.f, juce::Font::bold)); }
    juce::Font getPopupMenuFont() override { return juce::Font(juce::FontOptions(13.f)); }
};
