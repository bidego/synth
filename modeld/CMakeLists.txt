cmake_minimum_required(VERSION 3.16)
project(ModelD VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- Motor de audio (C++ puro) y sus pruebas: no necesitan JUCE ---
add_library(md_engine STATIC engine/md_engine.cpp engine/md_params.cpp)
target_include_directories(md_engine PUBLIC engine)
if(NOT MSVC)
  target_compile_options(md_engine PRIVATE -Wall -Wextra)
endif()

add_executable(md_tests tests/md_test.cpp)
target_link_libraries(md_tests PRIVATE md_engine)
enable_testing()
add_test(NAME engine COMMAND md_tests)

# --- El plugin (VST3 / AU / Standalone): cmake -S . -B build -DMODELD_BUILD_PLUGIN=ON ---
option(MODELD_BUILD_PLUGIN "Compilar el plugin (baja JUCE)" OFF)
if(MODELD_BUILD_PLUGIN)
  include(FetchContent)
  FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.4
    GIT_SHALLOW ON)
  FetchContent_MakeAvailable(JUCE)

  set(MODELD_FORMATS VST3 Standalone)
  if(APPLE)
    list(APPEND MODELD_FORMATS AU)
  endif()

  juce_add_plugin(ModelD
    COMPANY_NAME "Syntotec"
    BUNDLE_ID com.zondacloud.modeld
    PRODUCT_NAME "Model D"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE Synt
    PLUGIN_CODE Md01
    FORMATS ${MODELD_FORMATS}
    AU_MAIN_TYPE kAudioUnitType_MusicDevice
    VST3_CATEGORIES Instrument Synth)

  target_sources(ModelD PRIVATE
    source/PluginProcessor.cpp source/StandaloneMidi.cpp source/PluginProcessor.h
    source/PluginEditor.cpp source/PluginEditor.h source/MdLookAndFeel.h)
  target_compile_definitions(ModelD PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0)
  target_link_libraries(ModelD
    PRIVATE
      md_engine
      juce::juce_audio_utils
    PUBLIC
      juce::juce_recommended_config_flags
      juce::juce_recommended_lto_flags
      juce::juce_recommended_warning_flags)

  # Genera una captura PNG de la interfaz (para revisar el diseno en el CI): ModelDSnapshot salida.png [sonido]
  juce_add_console_app(ModelDSnapshot PRODUCT_NAME "ModelDSnapshot")
  target_sources(ModelDSnapshot PRIVATE tools/snapshot.cpp source/PluginProcessor.cpp source/StandaloneMidi.cpp source/PluginEditor.cpp)
  target_include_directories(ModelDSnapshot PRIVATE source)
  target_compile_definitions(ModelDSnapshot PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
  target_link_libraries(ModelDSnapshot PRIVATE md_engine juce::juce_audio_utils juce::juce_recommended_config_flags)
endif()
