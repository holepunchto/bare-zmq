cmake_minimum_required(VERSION 3.25)

find_package(cmake-bare REQUIRED PATHS node_modules/cmake-bare)
find_package(cmake-fetch REQUIRED PATHS node_modules/cmake-fetch)

set(CMAKE_MACOSX_BUNDLE OFF)

project(bare_zmq C CXX)

set(ZMQ_WIN32_WINNT "0x0A00" CACHE STRING "Windows SDK target" FORCE)

set(ZMQ_BUILD_TESTS OFF CACHE BOOL "Build ZeroMQ tests" FORCE)

set(ENABLE_PRECOMPILED OFF CACHE BOOL "Enable precompiled headers" FORCE)

set(ENABLE_WS OFF CACHE BOOL "Enable WebSocket transport" FORCE)

fetch_package("github:zeromq/libzmq@4.3.5")

add_bare_module(bare_zmq)

target_sources(
  ${bare_zmq}
  PRIVATE
    binding.c
)

target_link_libraries(
  ${bare_zmq}
  PUBLIC
    libzmq-static
)
