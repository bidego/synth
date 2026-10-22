cmake_minimum_required(VERSION 3.16)
project(RhythmEight VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- Motor de audio (C++ puro) y sus pruebas: no necesitan JUCE ---
add_library(re_engine STATIC engine/re_engine.cpp engine/re_params.cpp)
target_include_directories(re_engine PUBLIC engine)
if(NOT MSVC)
  target_compile_options(re_engine PRIVATE -Wall -Wextra)
endif()

add_executable(re_tests tests/re_test.cpp)
target_link_libraries(re_tests PRIVATE re_engine)
enable_testing()
add_test(NAME engine COMMAND re_tests)

# --- El plugin (VST3 / AU / Standalone): cmake -S . -B build -DRHYTHMEIGHT_BUILD_PLUGIN=ON ---
option(RHYTHMEIGHT_BUILD_PLUGIN "Compilar el plugin (baja JUCE)" OFF)
if(RHYTHMEIGHT_BUILD_PLUGIN)
  include(FetchContent)
  FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.4
    GIT_SHALLOW ON)
  FetchContent_MakeAvailable(JUCE)

  set(RHYTHMEIGHT_FORMATS VST3 Standalone)
  if(APPLE)
    list(APPEND RHYTHMEIGHT_FORMATS AU)
  endif()

  juce_add_plugin(RhythmEight
    COMPANY_NAME "Syntotec"
    BUNDLE_ID com.zondacloud.rhythmeight
    PRODUCT_NAME "Rhythm Eight"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE Synt
    PLUGIN_CODE Re01
    FORMATS ${RHYTHMEIGHT_FORMATS}
    AU_MAIN_TYPE kAudioUnitType_MusicDevice
    VST3_CATEGORIES Instrument Synth)

  target_sources(RhythmEight PRIVATE
    source/PluginProcessor.cpp source/StandaloneMidi.cpp source/PluginProcessor.h
    source/PluginEditor.cpp source/PluginEditor.h source/ReLookAndFeel.h)
  target_compile_definitions(RhythmEight PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0)
  target_link_libraries(RhythmEight
    PRIVATE
      re_engine
      juce::juce_audio_utils
    PUBLIC
      juce::juce_recommended_config_flags
      juce::juce_recommended_lto_flags
      juce::juce_recommended_warning_flags)

  # Genera una captura PNG de la interfaz (para revisar el diseno en el CI): RhythmEightSnapshot salida.png [sonido]
  juce_add_console_app(RhythmEightSnapshot PRODUCT_NAME "RhythmEightSnapshot")
  target_sources(RhythmEightSnapshot PRIVATE tools/snapshot.cpp source/PluginProcessor.cpp source/StandaloneMidi.cpp source/PluginEditor.cpp)
  target_include_directories(RhythmEightSnapshot PRIVATE source)
  target_compile_definitions(RhythmEightSnapshot PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
  target_link_libraries(RhythmEightSnapshot PRIVATE re_engine juce::juce_audio_utils juce::juce_recommended_config_flags)
endif()
