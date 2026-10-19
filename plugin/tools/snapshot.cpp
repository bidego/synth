// Genera una captura (PNG) de la interfaz del plugin sin abrir ventanas: sirve para revisar el diseno en el CI.
//   juno_snapshot salida.png [indice del sonido]
#include <cstdlib>
#include <juce_audio_utils/juce_audio_utils.h>
#include "PluginEditor.h"
#include "PluginProcessor.h"

int main(int argc, char** argv)
{
    if (argc < 2)
        return 1;
    juce::ScopedJuceInitialiser_GUI init;
    JunoProcessor proc;
    if (argc > 2)
        proc.setCurrentProgram(std::atoi(argv[2]));
    // Un acorde apretado en el teclado, para ver las teclas encendidas
    for (int note : { 60, 64, 67 })
        proc.keyboardState.noteOn(1, note, 0.8f);
    std::unique_ptr<juce::AudioProcessorEditor> editor(proc.createEditor());
    editor->setSize(JunoEditor::kWidth, JunoEditor::kHeight);
    const juce::Image image = editor->createComponentSnapshot(editor->getLocalBounds(), true, 1.0f);
    juce::File out(argv[1]);
    out.deleteFile();
    juce::FileOutputStream stream(out);
    if (!stream.openedOk())
        return 2;
    juce::PNGImageFormat png;
    return png.writeImageToStream(image, stream) ? 0 : 3;
}
