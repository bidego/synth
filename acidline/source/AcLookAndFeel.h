#pragma once
#include <juce_audio_utils/juce_audio_utils.h>

/** Escalas que rodean a una perilla del panel. */
enum class KnobScale { Ten, Bipolar, Steps, Waves };

/** El aspecto de Acid Line: perillas negras con falda metalica, interruptores de palanca, teclado de marfil. */
class AcLookAndFeel : public juce::LookAndFeel_V4 {
public:
    static constexpr float kStart = 1.25f * juce::MathConstants<float>::pi;
    static constexpr float kEnd = 2.75f * juce::MathConstants<float>::pi;

    static juce::Colour white() { return juce::Colour(0xfff4f2ea); }
    static juce::Colour ink() { return juce::Colour(0xff16171a); }   // tinta de los textos sobre la tapa plateada
    static juce::Colour dim() { return juce::Colour(0xffb9b7ae); }
    static juce::Colour orange() { return juce::Colour(0xffe8741b); }

    static juce::Font bold(float h, const char* face = "Helvetica Neue")
    {
        return juce::Font(juce::FontOptions(face, h, juce::Font::bold));
    }

    AcLookAndFeel()
    {
        setColour(juce::ComboBox::backgroundColourId, juce::Colour(0xff17171a));
        setColour(juce::ComboBox::textColourId, white());
        setColour(juce::ComboBox::outlineColourId, juce::Colour(0xff55554f));
        setColour(juce::ComboBox::arrowColourId, dim());
        setColour(juce::PopupMenu::backgroundColourId, juce::Colour(0xff17171a));
        setColour(juce::PopupMenu::textColourId, white());
        setColour(juce::PopupMenu::headerTextColourId, orange());
        setColour(juce::PopupMenu::highlightedBackgroundColourId, orange());
        setColour(juce::PopupMenu::highlightedTextColourId, juce::Colours::black);
        setColour(juce::TooltipWindow::backgroundColourId, juce::Colour(0xff17171a));
        setColour(juce::TooltipWindow::textColourId, white());
    }

    // --- Perillas: falda metalica estriada, tapa negra con brillo y una raya blanca hasta el borde ---
    void drawRotarySlider(juce::Graphics& g, int x, int y, int w, int h, float pos, float startAngle, float endAngle, juce::Slider& s) override
    {
        const auto area = juce::Rectangle<float>(float(x), float(y), float(w), float(h)).reduced(2.f);
        const float r = juce::jmin(area.getWidth(), area.getHeight()) * 0.5f;
        const auto c = area.getCentre();
        const auto circle = juce::Rectangle<float>(r * 2.f, r * 2.f).withCentre(c);

        // Sombra sobre el panel
        g.setColour(juce::Colours::black.withAlpha(0.6f));
        g.fillEllipse(circle.translated(1.5f, 3.5f).expanded(1.f));
        // Falda
        g.setGradientFill(juce::ColourGradient(juce::Colour(0xff8a8b90), c.x - r * 0.5f, c.y - r * 0.6f, juce::Colour(0xff17181a), c.x + r * 0.7f, c.y + r * 0.8f, true));
        g.fillEllipse(circle);
        g.setColour(juce::Colour(0xff050506));
        g.drawEllipse(circle, 1.3f);
        // Estrias de la falda
        g.setColour(juce::Colours::black.withAlpha(0.35f));
        for (int i = 0; i < 40; ++i) {
            const float a = juce::MathConstants<float>::twoPi * float(i) / 40.f;
            g.drawLine(c.x + std::sin(a) * r * 0.84f, c.y - std::cos(a) * r * 0.84f, c.x + std::sin(a) * r * 0.97f, c.y - std::cos(a) * r * 0.97f, 0.8f);
        }
        // Tapa negra
        const auto face = circle.reduced(r * 0.2f);
        g.setGradientFill(juce::ColourGradient(juce::Colour(0xff45454a), c.x - r * 0.35f, c.y - r * 0.5f, juce::Colour(0xff0a0a0c), c.x + r * 0.45f, c.y + r * 0.6f, true));
        g.fillEllipse(face);
        g.setColour(juce::Colours::white.withAlpha(0.22f));
        juce::Path rim;
        rim.addCentredArc(c.x, c.y, face.getWidth() * 0.5f - 1.f, face.getHeight() * 0.5f - 1.f, 0.f, -2.5f, 0.6f, true);
        g.strokePath(rim, juce::PathStrokeType(1.2f));
        g.setColour(juce::Colours::black);
        g.drawEllipse(face, 1.f);
        // Indicador
        const float a = startAngle + pos * (endAngle - startAngle);
        const float s0 = std::sin(a), c0 = -std::cos(a);
        g.setColour(juce::Colours::black.withAlpha(0.5f));
        g.drawLine(c.x + s0 * r * 0.25f + 0.8f, c.y + c0 * r * 0.25f + 1.2f, c.x + s0 * r * 0.94f + 0.8f, c.y + c0 * r * 0.94f + 1.2f, 3.2f);
        g.setColour(s.isMouseOverOrDragging() ? juce::Colour(0xffffd9b0) : white());
        g.drawLine(c.x + s0 * r * 0.25f, c.y + c0 * r * 0.25f, c.x + s0 * r * 0.94f, c.y + c0 * r * 0.94f, 2.6f);
    }

    // --- Interruptores de palanca: la cara levantada brilla, la hundida queda oscura ---
    void drawToggleButton(juce::Graphics& g, juce::ToggleButton& b, bool highlighted, bool) override
    {
        const auto r = b.getLocalBounds().toFloat();
        g.setColour(ink());
        g.setFont(bold(9.f));
        g.drawFittedText(b.getButtonText(), 0, 0, b.getWidth(), 22, juce::Justification::centredBottom, 2);

        const auto body = juce::Rectangle<float>(26.f, 40.f).withCentre({ r.getCentreX(), r.getBottom() - 25.f });
        // Marco metalico
        g.setGradientFill(juce::ColourGradient(juce::Colour(0xffb7b8bc), body.getX(), body.getY(), juce::Colour(0xff45464a), body.getRight(), body.getBottom(), false));
        g.fillRoundedRectangle(body.expanded(3.f), 5.f);
        g.setColour(juce::Colour(0xff060607));
        g.fillRoundedRectangle(body, 3.f);
        // Palanca
        const bool on = b.getToggleState();
        const auto upper = body.withHeight(body.getHeight() * (on ? 0.64f : 0.36f)).reduced(2.5f, 1.5f);
        const auto lower = body.withTop(upper.getBottom() + 1.f).reduced(2.5f, 0.f).withBottom(body.getBottom() - 1.5f);
        const auto lit = on ? upper : lower;
        const auto dark = on ? lower : upper;
        g.setGradientFill(juce::ColourGradient(highlighted ? juce::Colour(0xfffff1dc) : juce::Colour(0xffefece2), lit.getX(), lit.getY(),
                                               juce::Colour(0xff9b988c), lit.getX(), lit.getBottom(), false));
        g.fillRoundedRectangle(lit, 2.5f);
        g.setColour(on ? orange() : juce::Colour(0xff6d6b63));
        g.fillRect(lit.getX() + 4.f, lit.getCentreY() - 1.f, lit.getWidth() - 8.f, 2.f);
        g.setGradientFill(juce::ColourGradient(juce::Colour(0xff2a2a2d), dark.getX(), dark.getY(), juce::Colour(0xff0d0d0f), dark.getX(), dark.getBottom(), false));
        g.fillRoundedRectangle(dark, 2.5f);
        g.setColour(juce::Colours::white.withAlpha(0.18f));
        g.drawLine(lit.getX() + 2.f, lit.getY() + 1.f, lit.getRight() - 2.f, lit.getY() + 1.f, 1.f);
    }

    // --- Botones del selector de sonidos ---
    juce::Font getTextButtonFont(juce::TextButton&, int) override { return bold(12.f); }

    void drawButtonBackground(juce::Graphics& g, juce::Button& b, const juce::Colour&, bool highlighted, bool down) override
    {
        const auto r = b.getLocalBounds().toFloat().reduced(0.5f);
        g.setGradientFill(juce::ColourGradient::vertical(down ? juce::Colour(0xff0e0e10) : highlighted ? juce::Colour(0xff34343a) : juce::Colour(0xff26262a), r.getY(),
                                                         juce::Colour(0xff101012), r.getBottom()));
        g.fillRoundedRectangle(r, 3.f);
        g.setColour(highlighted ? juce::Colour(0xff9a9890) : juce::Colour(0xff55554f));
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

    // --- Iconos de las ondas (alrededor de la perilla de forma de onda) ---
    static void drawWaveIcon(juce::Graphics& g, int type, juce::Rectangle<float> r, juce::Colour colour)
    {
        juce::Path p;
        auto pt = [&](float fx, float fy) { return juce::Point<float>(r.getX() + fx * r.getWidth(), r.getY() + fy * r.getHeight()); };
        switch (type) {
            case 0: p.startNewSubPath(pt(0.f, 0.9f)); p.lineTo(pt(0.5f, 0.1f)); p.lineTo(pt(1.f, 0.9f)); break;                       // triangulo
            case 1: p.startNewSubPath(pt(0.f, 0.9f)); p.lineTo(pt(0.72f, 0.1f)); p.lineTo(pt(1.f, 0.9f)); break;                      // diente de tiburon
            case 2: p.startNewSubPath(pt(0.f, 0.9f)); p.lineTo(pt(0.85f, 0.1f)); p.lineTo(pt(0.85f, 0.9f)); p.lineTo(pt(1.f, 0.9f)); break;   // sierra
            case 3: p.startNewSubPath(pt(0.f, 0.9f)); p.lineTo(pt(0.f, 0.1f)); p.lineTo(pt(0.5f, 0.1f)); p.lineTo(pt(0.5f, 0.9f)); p.lineTo(pt(1.f, 0.9f)); break;
            case 4: p.startNewSubPath(pt(0.f, 0.9f)); p.lineTo(pt(0.f, 0.1f)); p.lineTo(pt(0.33f, 0.1f)); p.lineTo(pt(0.33f, 0.9f)); p.lineTo(pt(1.f, 0.9f)); break;
            default: p.startNewSubPath(pt(0.f, 0.9f)); p.lineTo(pt(0.f, 0.1f)); p.lineTo(pt(0.15f, 0.1f)); p.lineTo(pt(0.15f, 0.9f)); p.lineTo(pt(1.f, 0.9f)); break;
        }
        g.setColour(colour);
        g.strokePath(p, juce::PathStrokeType(1.4f, juce::PathStrokeType::mitered, juce::PathStrokeType::butt));
    }
};
