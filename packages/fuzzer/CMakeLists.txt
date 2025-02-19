cmake_minimum_required(VERSION 3.15)

project(jazzerjs)

find_package(Patch REQUIRED)

set(CMAKE_CXX_STANDARD 17)      # mostly supported since GCC 7
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(LLVM_ENABLE_LLD TRUE)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# To help with development, let's write compile_commands.json unconditionally.
set(CMAKE_EXPORT_COMPILE_COMMANDS 1)

# As per the cmake-js README, we need the following to build on Windows:
if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  set(LIBFUZZER_TARGET "clang_rt.fuzzer_no_main-x86_64")
  set(LIBFUZZER_STATIC_LIB_PATH "lib/linux/lib${LIBFUZZER_TARGET}.a")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
  set(LIBFUZZER_TARGET "clang_rt.fuzzer_no_main_osx")
  set(LIBFUZZER_STATIC_LIB_PATH "lib/darwin/lib${LIBFUZZER_TARGET}.a")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /MT /EHsc")
  set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} /MT /EHsc")
  set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} /MTd /EHsc")
  set(LIBFUZZER_TARGET "clang_rt.fuzzer_no_main-x86_64")
  set(LIBFUZZER_STATIC_LIB_PATH "lib/windows/${LIBFUZZER_TARGET}.lib")
endif()

# Enable the functionality of Node-API version 4 and disable everything added
# later, so that we don't accidentally break compatibility with older versions
# of Node (see https://nodejs.org/api/n-api.html#node-api-version-matrix).
#
# Note that prebuild recommends in its README to use ${napi_build_version} here,
# but the variable is only set when cmake-js is invoked via prebuild (in which
# case the API version is taken from "binary.napi_versions" in package.json).
# Since we want the build to work in other cases as well, let's just use a
# constant. (There is currently no point in a dynamic setting anyway since we
# specify the oldest version that we're compatible with, and Node-API's ABI
# stability guarantees that this version is available in all future Node-API
# releases.)
add_definitions(-DNAPI_VERSION=4)

add_library(${PROJECT_NAME} SHARED
  "addon.cpp"
  "shared/callbacks.cpp"
  "shared/coverage.cpp"
  "shared/sanitizer_symbols.cpp"
  "shared/tracing.cpp"
  "start_fuzzing_sync.cpp"
  "start_fuzzing_async.cpp"
  "utils.cpp"
  ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(${PROJECT_NAME} PRIVATE ${CMAKE_JS_INC})
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

# Download and build compiler-rt, which contains libfuzzer.
include(ExternalProject)
ExternalProject_Add(compiler-rt
  URL https://github.com/CodeIntelligenceTesting/llvm-project-jazzer/archive/refs/tags/2022-11-25.tar.gz
  URL_HASH SHA256=e691dc9b45c35713fa67c613d352b646f30cab5d35d15abfcf77cc004a3befdb
  SOURCE_SUBDIR compiler-rt
  CMAKE_ARGS
  # compiler-rt usually initializes the sanitizer runtime by means of a pointer
  # in the .preinit_array section; since .preinit_array isn't supported for
  # shared objects like our Node plugin, disable it here.
  -DCMAKE_CXX_FLAGS="-DSANITIZER_CAN_USE_PREINIT_ARRAY=0"
  # No need to build all the sanitizers; the UBSan standalone runtime is built
  # by default.
  -DCOMPILER_RT_SANITIZERS_TO_BUILD=""
  # Don't build libc++ into the fuzzer; our own code is C++ as well, so we're
  # going to link against a C++ runtime anyway.
  -DCOMPILER_RT_USE_LIBCXX=OFF
  # Use the same build type as the parent project.
  -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
  # We only need libfuzzer from the compiler-rt project.
  BUILD_COMMAND ${CMAKE_COMMAND} --build <BINARY_DIR> --target ${LIBFUZZER_TARGET}
  # Skip the install step because it tries to copy files to a hardcoded path in "/usr".
  INSTALL_COMMAND ""
  # Tell CMake about the libfuzzer libraries that are built as part of the
  # external project. Some CMake generators fail if we later depend on the
  # libraries without declaring them here (including ninja).
  BUILD_BYPRODUCTS
  <BINARY_DIR>/${LIBFUZZER_STATIC_LIB_PATH})

# Make our plugin depend on and link against libfuzzer.
add_dependencies(${PROJECT_NAME} compiler-rt)
ExternalProject_Get_Property(compiler-rt BINARY_DIR)
ExternalProject_Get_Property(compiler-rt SOURCE_DIR)
target_include_directories(${PROJECT_NAME} PRIVATE ${SOURCE_DIR}/compiler-rt/lib)

# We may want to include additional libraries here. For example,
# libclang_rt.fuzzer_interceptors-x86_64.a contains
# https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/fuzzer/FuzzerInterceptors.cpp,
# i.e., fuzzer-friendly overrides for some common libc functions. However,
# there is a challenge with this particular library: we're not in the binary,
# so we can't intercept libc.
#
# Remember to add any libraries mentioned here to the BUILD_BYPRODUCTS of the
# external compiler-rt project above.
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  target_link_libraries(${PROJECT_NAME}
          -Wl,-whole-archive
          ${BINARY_DIR}/${LIBFUZZER_STATIC_LIB_PATH}
          -Wl,-no-whole-archive)
elseif(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
  target_link_libraries(${PROJECT_NAME}
          -Wl,-all_load
          ${BINARY_DIR}/${LIBFUZZER_STATIC_LIB_PATH}
          -Wl,-noall_load)
elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
  # Force MSVC to do an MT build, suggested by cmake-js
  cmake_policy(SET CMP0091 NEW)
  target_link_libraries(${PROJECT_NAME} "$<LINK_LIBRARY:WHOLE_ARCHIVE,${BINARY_DIR}/${LIBFUZZER_STATIC_LIB_PATH}>")
endif()

# Avoid downloading the full nodejs headers, and bundle a much more lightweight copy instead
if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()
