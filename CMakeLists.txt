cmake_minimum_required(VERSION 3.25)

find_package(cmake-bare REQUIRED PATHS node_modules/cmake-bare)
find_package(cmake-fetch REQUIRED PATHS node_modules/cmake-fetch)

project(bare_zmq C CXX)

set(ZMQ_WIN32_WINNT "0x0A00" CACHE STRING "Windows SDK target" FORCE)
set(ZMQ_BUILD_TESTS OFF CACHE BOOL "Build ZeroMQ tests" FORCE)

set(BUILD_SHARED OFF CACHE BOOL "Build shared ZeroMQ library" FORCE)
set(BUILD_SHARED ON CACHE BOOL "Build static ZeroMQ library" FORCE)

fetch_package("github:zeromq/libzmq@4.3.5")

add_bare_module(bare_zmq)

target_sources(
  ${bare_zmq}
  PRIVATE
    binding.c
)

target_link_libraries(
  ${bare_zmq}
  PRIVATE
    libzmq-static
)
