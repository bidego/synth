cmake_minimum_required(VERSION 3.16)
project(Juno106 VERSION 0.2.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- Motor de audio (C++ puro) y sus pruebas: no necesitan JUCE ---
add_library(juno_engine STATIC engine/juno_engine.cpp engine/juno_params.cpp)
target_include_directories(juno_engine PUBLIC engine)
if(NOT MSVC)
  target_compile_options(juno_engine PRIVATE -Wall -Wextra)
endif()

add_executable(juno_tests tests/engine_test.cpp)
target_link_libraries(juno_tests PRIVATE juno_engine)
enable_testing()
add_test(NAME engine COMMAND juno_tests)

# --- El plugin (VST3 / AU / Standalone): cmake -S . -B build -DJUNO_BUILD_PLUGIN=ON ---
option(JUNO_BUILD_PLUGIN "Compilar el plugin (baja JUCE)" OFF)
if(JUNO_BUILD_PLUGIN)
  include(FetchContent)
  FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.4
    GIT_SHALLOW ON)
  FetchContent_MakeAvailable(JUCE)

  set(JUNO_FORMATS VST3 Standalone)
  if(APPLE)
    list(APPEND JUNO_FORMATS AU)
  endif()

  juce_add_plugin(Juno106
    COMPANY_NAME "Syntotec"
    BUNDLE_ID com.zondacloud.juno106
    PRODUCT_NAME "Juno 106"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE Synt
    PLUGIN_CODE Jn06
    FORMATS ${JUNO_FORMATS}
    AU_MAIN_TYPE kAudioUnitType_MusicDevice
    VST3_CATEGORIES Instrument Synth)

  target_sources(Juno106 PRIVATE source/PluginProcessor.cpp source/PluginProcessor.h
    source/PluginEditor.cpp source/PluginEditor.h source/JunoLookAndFeel.h)
  target_compile_definitions(Juno106 PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0)
  target_link_libraries(Juno106
    PRIVATE
      juno_engine
      juce::juce_audio_utils
    PUBLIC
      juce::juce_recommended_config_flags
      juce::juce_recommended_lto_flags
      juce::juce_recommended_warning_flags)

  # Genera una captura PNG de la interfaz (para revisar el diseno en el CI): juno_snapshot salida.png [sonido]
  juce_add_console_app(JunoSnapshot PRODUCT_NAME "juno_snapshot")
  target_sources(JunoSnapshot PRIVATE tools/snapshot.cpp source/PluginProcessor.cpp source/PluginEditor.cpp)
  target_include_directories(JunoSnapshot PRIVATE source)
  target_compile_definitions(JunoSnapshot PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
  target_link_libraries(JunoSnapshot PRIVATE juno_engine juce::juce_audio_utils juce::juce_recommended_config_flags)
endif()
