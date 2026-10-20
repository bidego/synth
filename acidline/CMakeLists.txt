cmake_minimum_required(VERSION 3.16)
project(AcidLine VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- Motor de audio (C++ puro) y sus pruebas: no necesitan JUCE ---
add_library(ac_engine STATIC engine/ac_engine.cpp engine/ac_params.cpp)
target_include_directories(ac_engine PUBLIC engine)
if(NOT MSVC)
  target_compile_options(ac_engine PRIVATE -Wall -Wextra)
endif()

add_executable(ac_tests tests/ac_test.cpp)
target_link_libraries(ac_tests PRIVATE ac_engine)
enable_testing()
add_test(NAME engine COMMAND ac_tests)

# --- El plugin (VST3 / AU / Standalone): cmake -S . -B build -DACIDLINE_BUILD_PLUGIN=ON ---
option(ACIDLINE_BUILD_PLUGIN "Compilar el plugin (baja JUCE)" OFF)
if(ACIDLINE_BUILD_PLUGIN)
  include(FetchContent)
  FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.4
    GIT_SHALLOW ON)
  FetchContent_MakeAvailable(JUCE)

  set(ACIDLINE_FORMATS VST3 Standalone)
  if(APPLE)
    list(APPEND ACIDLINE_FORMATS AU)
  endif()

  juce_add_plugin(AcidLine
    COMPANY_NAME "Syntotec"
    BUNDLE_ID com.zondacloud.acidline
    PRODUCT_NAME "Acid Line"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE Synt
    PLUGIN_CODE Ac01
    FORMATS ${ACIDLINE_FORMATS}
    AU_MAIN_TYPE kAudioUnitType_MusicDevice
    VST3_CATEGORIES Instrument Synth)

  target_sources(AcidLine PRIVATE
    source/PluginProcessor.cpp source/PluginProcessor.h
    source/PluginEditor.cpp source/PluginEditor.h source/AcLookAndFeel.h)
  target_compile_definitions(AcidLine PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0)
  target_link_libraries(AcidLine
    PRIVATE
      ac_engine
      juce::juce_audio_utils
    PUBLIC
      juce::juce_recommended_config_flags
      juce::juce_recommended_lto_flags
      juce::juce_recommended_warning_flags)

  # Genera una captura PNG de la interfaz (para revisar el diseno en el CI): AcidSnapshot salida.png [sonido]
  juce_add_console_app(AcidSnapshot PRODUCT_NAME "AcidSnapshot")
  target_sources(AcidSnapshot PRIVATE tools/snapshot.cpp source/PluginProcessor.cpp source/PluginEditor.cpp)
  target_include_directories(AcidSnapshot PRIVATE source)
  target_compile_definitions(AcidSnapshot PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
  target_link_libraries(AcidSnapshot PRIVATE ac_engine juce::juce_audio_utils juce::juce_recommended_config_flags)
endif()
