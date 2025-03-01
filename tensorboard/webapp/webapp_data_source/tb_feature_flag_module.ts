/* Copyright 2020 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import {NgModule} from '@angular/core';

import {TBFeatureFlagDataSource} from './tb_feature_flag_data_source_types';
import {QueryParamsFeatureFlagDataSource} from './tb_feature_flag_data_source';
import {QueryParams} from './query_params';

@NgModule({
  providers: [
    // Provide as injectable for other app-level implementations of
    // TBFeatureFlagDataSource.
    QueryParamsFeatureFlagDataSource,
    QueryParams,
    // Provide as the TBFeatureFlagDataSource implementation for the OSS app.
    {
      provide: TBFeatureFlagDataSource,
      useClass: QueryParamsFeatureFlagDataSource,
    },
  ],
})
export class TBFeatureFlagModule {}
