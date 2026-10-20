cmake_minimum_required(VERSION 3.16)
project(PolyFive VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- Motor de audio (C++ puro) y sus pruebas: no necesitan JUCE ---
add_library(pf_engine STATIC engine/pf_engine.cpp engine/pf_params.cpp)
target_include_directories(pf_engine PUBLIC engine)
if(NOT MSVC)
  target_compile_options(pf_engine PRIVATE -Wall -Wextra)
endif()

add_executable(pf_tests tests/pf_test.cpp)
target_link_libraries(pf_tests PRIVATE pf_engine)
enable_testing()
add_test(NAME engine COMMAND pf_tests)

# --- El plugin (VST3 / AU / Standalone): cmake -S . -B build -DPOLYFIVE_BUILD_PLUGIN=ON ---
option(POLYFIVE_BUILD_PLUGIN "Compilar el plugin (baja JUCE)" OFF)
if(POLYFIVE_BUILD_PLUGIN)
  include(FetchContent)
  FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.4
    GIT_SHALLOW ON)
  FetchContent_MakeAvailable(JUCE)

  set(POLYFIVE_FORMATS VST3 Standalone)
  if(APPLE)
    list(APPEND POLYFIVE_FORMATS AU)
  endif()

  juce_add_plugin(PolyFive
    COMPANY_NAME "Syntotec"
    BUNDLE_ID com.zondacloud.polyfive
    PRODUCT_NAME "Poly Five"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE Synt
    PLUGIN_CODE Pf01
    FORMATS ${POLYFIVE_FORMATS}
    AU_MAIN_TYPE kAudioUnitType_MusicDevice
    VST3_CATEGORIES Instrument Synth)

  target_sources(PolyFive PRIVATE
    source/PluginProcessor.cpp source/PluginProcessor.h
    source/PluginEditor.cpp source/PluginEditor.h source/PfLookAndFeel.h)
  target_compile_definitions(PolyFive PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0)
  target_link_libraries(PolyFive
    PRIVATE
      pf_engine
      juce::juce_audio_utils
    PUBLIC
      juce::juce_recommended_config_flags
      juce::juce_recommended_lto_flags
      juce::juce_recommended_warning_flags)

  # Genera una captura PNG de la interfaz (para revisar el diseno en el CI): PolyFiveSnapshot salida.png [sonido]
  juce_add_console_app(PolyFiveSnapshot PRODUCT_NAME "PolyFiveSnapshot")
  target_sources(PolyFiveSnapshot PRIVATE tools/snapshot.cpp source/PluginProcessor.cpp source/PluginEditor.cpp)
  target_include_directories(PolyFiveSnapshot PRIVATE source)
  target_compile_definitions(PolyFiveSnapshot PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
  target_link_libraries(PolyFiveSnapshot PRIVATE pf_engine juce::juce_audio_utils juce::juce_recommended_config_flags)
endif()
