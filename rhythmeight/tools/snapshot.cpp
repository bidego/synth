// Genera una captura (PNG) de la interfaz del plugin sin abrir ventanas: sirve para revisar el diseno en el CI.
//   RhythmEightSnapshot salida.png [indice del sonido]
#include <cstdlib>
#include <juce_audio_utils/juce_audio_utils.h>
#include "PluginEditor.h"
#include "PluginProcessor.h"

int main(int argc, char** argv)
{
    if (argc < 2)
        return 1;
    juce::ScopedJuceInitialiser_GUI init;
    RhythmEightProcessor proc;
    if (argc > 2)
        proc.setCurrentProgram(std::atoi(argv[2]));
    proc.currentStep.store(5);   // un paso actual de ejemplo para ver el indicador
    std::unique_ptr<juce::AudioProcessorEditor> editor(proc.createEditor());
    editor->setSize(RhythmEightEditor::kWidth, RhythmEightEditor::kHeight);
    const juce::Image image = editor->createComponentSnapshot(editor->getLocalBounds(), true, 1.0f);
    juce::File out(argv[1]);
    out.deleteFile();
    juce::FileOutputStream stream(out);
    if (!stream.openedOk())
        return 2;
    juce::PNGImageFormat png;
    return png.writeImageToStream(image, stream) ? 0 : 3;
}
