// Tilda los controladores MIDI en la aplicacion independiente (ver StandaloneMidi en PluginProcessor.h). Va en su propio archivo porque el
// encabezado del standalone de JUCE usa nombres sin el prefijo juce:: y necesita "using namespace juce" a nivel global.
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

#if JucePlugin_Build_Standalone
using namespace juce;
#include <juce_audio_plugin_client/Standalone/juce_StandaloneFilterWindow.h>

void standaloneAutoEnableMidi(juce::StringArray& known, bool& loaded)
{
    auto* holder = juce::StandalonePluginHolder::getInstance();
    if (holder == nullptr)
        return;   // la ventana de la app todavia se esta armando
    const juce::String key = "knownMidiInputs";
    if (!loaded) {
        loaded = true;
        if (holder->settings != nullptr)
            known = juce::StringArray::fromLines(holder->settings->getValue(key));
    }
    bool changed = false;
    for (const auto& d : juce::MidiInput::getAvailableDevices())
        if (!known.contains(d.identifier)) {
            known.add(d.identifier);
            holder->deviceManager.setMidiInputDeviceEnabled(d.identifier, true);
            changed = true;
        }
    if (changed && holder->settings != nullptr)
        holder->settings->setValue(key, known.joinIntoString("\n"));
}
#else
void standaloneAutoEnableMidi(juce::StringArray&, bool&) {}
#endif
