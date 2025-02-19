// Copyright 2022 Code Intelligence GmbH
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

#include <iostream>

#include "start_fuzzing_async.h"
#include "start_fuzzing_sync.h"

#include "shared/callbacks.h"

// A basic sanity check: ask the Node API for version information and print it.
void PrintVersion(const Napi::CallbackInfo &info) {
  auto napi_version = Napi::VersionManagement::GetNapiVersion(info.Env());
  auto node_version = Napi::VersionManagement::GetNodeVersion(info.Env());
  std::cout << "Jazzer.js running on Node " << node_version->major
            << " using Node-API version " << napi_version << std::endl;
}

// Initialize the module by populating its JS exports with pointers to our C++
// functions.
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports["printVersion"] = Napi::Function::New<PrintVersion>(env);
  exports["startFuzzing"] = Napi::Function::New<StartFuzzing>(env);
  exports["startFuzzingAsync"] = Napi::Function::New<StartFuzzingAsync>(env);
  exports["stopFuzzingAsync"] = Napi::Function::New<StopFuzzingAsync>(env);

  RegisterCallbackExports(env, exports);
  return exports;
}

NODE_API_MODULE(jazzerjs, Init)
