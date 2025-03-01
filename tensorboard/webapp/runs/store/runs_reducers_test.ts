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
import {navigated, stateRehydratedFromUrl} from '../../app_routing/actions';
import {buildCompareRoute, buildRoute} from '../../app_routing/testing';
import {RouteKind} from '../../app_routing/types';
import {deepFreeze} from '../../testing/lang';
import {DataLoadState} from '../../types/data';
import {SortDirection} from '../../types/ui';
import * as colorUtils from '../../util/colors';
import * as actions from '../actions';
import {buildHparamsAndMetadata} from '../data_source/testing';
import {GroupByKey, SortType, URLDeserializedState} from '../types';
import * as runsReducers from './runs_reducers';
import {MAX_NUM_RUNS_TO_ENABLE_BY_DEFAULT, Run} from './runs_types';
import {buildRun, buildRunsState} from './testing';

describe('runs_reducers', () => {
  [
    {
      action: actions.fetchRunsRequested,
      actionName: 'fetchRunsRequested',
      expectedStatus: DataLoadState.LOADING,
    },
    {
      action: actions.fetchRunsFailed,
      actionName: 'fetchRunsFailed',
      expectedStatus: DataLoadState.FAILED,
    },
  ].forEach((metaSpec) => {
    describe(metaSpec.actionName, () => {
      it(`sets the loadState as ${
        DataLoadState[metaSpec.expectedStatus]
      }`, () => {
        const state = buildRunsState({
          runsLoadState: {
            id1: {state: DataLoadState.LOADED, lastLoadedTimeInMs: null},
            id3: {state: DataLoadState.LOADED, lastLoadedTimeInMs: null},
          },
        });
        const nextState = runsReducers.reducers(
          state,
          metaSpec.action({
            experimentIds: ['id1', 'id2', 'id3'],
            requestedExperimentIds: ['id1', 'id2'],
          })
        );

        expect(nextState.data.runsLoadState['id1']).toEqual({
          lastLoadedTimeInMs: null,
          state: metaSpec.expectedStatus,
        });
        expect(nextState.data.runsLoadState['id2']).toEqual({
          lastLoadedTimeInMs: null,
          state: metaSpec.expectedStatus,
        });
        expect(nextState.data.runsLoadState['id3']).toEqual({
          lastLoadedTimeInMs: null,
          state: DataLoadState.LOADED,
        });
      });

      it('keeps lastLoadedTimeInMs and runs the same', () => {
        const state = deepFreeze(
          buildRunsState({
            runIds: {
              id1: ['Foo', 'Foo/bar'],
            },
            runMetadata: {
              Foo: buildRun({id: 'Foo'}),
              'Foo/bar': buildRun({id: 'Foo/bar'}),
            },
            runsLoadState: {
              id1: {state: DataLoadState.LOADED, lastLoadedTimeInMs: 12345},
            },
          })
        );
        const nextState = runsReducers.reducers(
          state,
          metaSpec.action({
            experimentIds: ['id1'],
            requestedExperimentIds: ['id1'],
          })
        );

        expect(nextState.data.runIds).toBe(state.data.runIds);
        expect(nextState.data.runMetadata).toBe(state.data.runMetadata);
        expect(nextState.data.runsLoadState['id1'].lastLoadedTimeInMs).toEqual(
          12345
        );
      });

      it('adds to new key if existing state did not have it', () => {
        const state = deepFreeze(
          buildRunsState({
            runsLoadState: {
              id1: {state: DataLoadState.LOADED, lastLoadedTimeInMs: 12345},
            },
          })
        );
        const nextState = runsReducers.reducers(
          state,
          metaSpec.action({
            experimentIds: ['id2'],
            requestedExperimentIds: ['id2'],
          })
        );

        expect(nextState.data.runsLoadState['id1'].state).toEqual(
          DataLoadState.LOADED
        );
        expect(nextState.data.runsLoadState['id2'].state).toEqual(
          metaSpec.expectedStatus
        );
      });
    });
  });

  describe('fetchRunsSucceeded', () => {
    function createFakeRuns(count: number): Run[] {
      return [...new Array(count)].map((unused, index) => {
        return buildRun({id: `id1_${index}`});
      });
    }

    it('updates experiment and loadState', () => {
      // Zone.js installs mock clock and gets in the way of Jasmine mockClock.
      spyOn(Date, 'now').and.returnValue(12345);
      const state = buildRunsState({
        runIds: {eid1: []},
        runIdToExpId: {rid5: 'eid5'},
        runMetadata: {},
        runsLoadState: {
          eid1: {state: DataLoadState.LOADING, lastLoadedTimeInMs: null},
        },
      });
      const action = actions.fetchRunsSucceeded({
        experimentIds: [],
        runsForAllExperiments: [],
        newRunsAndMetadata: {
          eid1: {
            runs: [
              {id: 'rid1', name: 'Run 1', startTime: 1},
              {id: 'rid2', name: 'Run 2', startTime: 1},
            ],
            metadata: buildHparamsAndMetadata({
              runToHparamsAndMetrics: {
                rid1: {hparams: [{name: 'foo', value: 'bar'}], metrics: []},
              },
            }),
          },
        },
      });

      const nextState = runsReducers.reducers(state, action);

      expect(nextState.data.runIds).toEqual({eid1: ['rid1', 'rid2']});
      expect(nextState.data.runIdToExpId).toEqual({
        rid1: 'eid1',
        rid2: 'eid1',
        rid5: 'eid5',
      });
      expect(nextState.data.runMetadata).toEqual({
        rid1: {
          id: 'rid1',
          name: 'Run 1',
          startTime: 1,
          hparams: [{name: 'foo', value: 'bar'}],
          metrics: [],
        },
        rid2: {
          id: 'rid2',
          name: 'Run 2',
          startTime: 1,
          hparams: null,
          metrics: null,
        },
      });
      expect(nextState.data.runsLoadState).toEqual({
        eid1: {state: DataLoadState.LOADED, lastLoadedTimeInMs: 12345},
      });
    });

    it('assigns default color to new runs', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.RUN},
        defaultRunColorForGroupBy: new Map([
          ['foo', '#aaa'],
          ['bar', '#bbb'],
        ]),
        groupKeyToColorString: new Map([
          ['foo', '#aaa'],
          ['bar', '#bbb'],
          ['1', '#ccc'],
          ['2', '#ddd'],
          ['3', '#eee'],
        ]),
      });
      const action = actions.fetchRunsSucceeded({
        experimentIds: ['eid1'],
        runsForAllExperiments: [
          buildRun({id: 'baz'}),
          buildRun({id: 'foo'}),
          buildRun({id: 'qaz'}),
          buildRun({id: 'alpha'}),
          buildRun({id: 'beta'}),
          buildRun({id: 'gamma'}),
          buildRun({id: 'lambda'}),
        ],
        newRunsAndMetadata: {
          eid1: {
            runs: [
              buildRun({id: 'baz'}),
              buildRun({id: 'foo'}),
              buildRun({id: 'qaz'}),
              buildRun({id: 'alpha'}),
              buildRun({id: 'beta'}),
              buildRun({id: 'gamma'}),
              buildRun({id: 'lambda'}),
            ],
            metadata: buildHparamsAndMetadata({}),
          },
        },
      });

      const nextState = runsReducers.reducers(state, action);

      expect(nextState.data.defaultRunColorForGroupBy).toEqual(
        new Map([
          ['foo', '#aaa'],
          ['bar', '#bbb'],
          ['baz', colorUtils.CHART_COLOR_PALLETE[5]],
          ['qaz', colorUtils.CHART_COLOR_PALLETE[6]],
          ['alpha', colorUtils.CHART_COLOR_PALLETE[0]],
          ['beta', colorUtils.CHART_COLOR_PALLETE[1]],
          ['gamma', colorUtils.CHART_COLOR_PALLETE[2]],
          ['lambda', colorUtils.CHART_COLOR_PALLETE[3]],
        ])
      );
    });

    describe('advanced grouping', () => {
      it('assigns default color to by experiment', () => {
        const state = buildRunsState({
          initialGroupBy: {key: GroupByKey.RUN},
          userSetGroupByKey: GroupByKey.EXPERIMENT,
          defaultRunColorForGroupBy: new Map([
            ['foo', '#aaa'],
            // `bar` is not present in neither experiment for `runsForAllExperiments` below;
            // pretend like there is a data inconsistency.
            ['bar', '#aaa'],
          ]),
          groupKeyToColorString: new Map([['eid1', '#aaa']]),
        });
        const action = actions.fetchRunsSucceeded({
          experimentIds: ['eid1', 'eid2'],
          runsForAllExperiments: [
            buildRun({id: 'baz'}),
            // `foo` already exists in the state.
            buildRun({id: 'foo'}),
            buildRun({id: 'qaz'}),
            buildRun({id: 'alpha'}),
            buildRun({id: 'beta'}),
            buildRun({id: 'gamma'}),
            buildRun({id: 'lambda'}),
          ],
          newRunsAndMetadata: {
            eid1: {
              runs: [
                buildRun({id: 'baz'}),
                buildRun({id: 'foo'}),
                buildRun({id: 'qaz'}),
              ],
              metadata: buildHparamsAndMetadata({}),
            },
            eid2: {
              runs: [
                buildRun({id: 'alpha'}),
                buildRun({id: 'beta'}),
                buildRun({id: 'gamma'}),
                buildRun({id: 'lambda'}),
              ],
              metadata: buildHparamsAndMetadata({}),
            },
          },
        });

        const nextState = runsReducers.reducers(state, action);

        expect(nextState.data.defaultRunColorForGroupBy).toEqual(
          new Map([
            ['foo', '#aaa'],
            ['bar', '#aaa'],
            ['baz', '#aaa'],
            ['qaz', '#aaa'],
            ['alpha', colorUtils.CHART_COLOR_PALLETE[1]],
            ['beta', colorUtils.CHART_COLOR_PALLETE[1]],
            ['gamma', colorUtils.CHART_COLOR_PALLETE[1]],
            ['lambda', colorUtils.CHART_COLOR_PALLETE[1]],
          ])
        );
      });

      it('assigns non-matched colors to regex non-matched runs', () => {
        const state = buildRunsState({
          initialGroupBy: {key: GroupByKey.REGEX, regexString: 'foo(\\d+)'},
          defaultRunColorForGroupBy: new Map([
            ['foo', '#aaa'],
            ['bar', '#aaa'],
          ]),
        });
        const action = actions.fetchRunsSucceeded({
          experimentIds: ['eid1', 'eid2'],
          runsForAllExperiments: [
            buildRun({id: 'eid1/alpha', name: 'foo1bar1'}),
            buildRun({id: 'eid1/beta', name: 'foo2bar1'}),
            buildRun({id: 'eid2/beta', name: 'foo2bar2'}),
            buildRun({id: 'eid2/gamma', name: 'foo2bar2bar'}),
            buildRun({id: 'eid2/alpha', name: 'alpha'}),
            buildRun({id: 'eid2/delta', name: 'delta'}),
          ],
          newRunsAndMetadata: {},
        });

        const nextState = runsReducers.reducers(state, action);

        expect(nextState.data.defaultRunColorForGroupBy).toEqual(
          new Map([
            ['foo', '#aaa'],
            ['bar', '#aaa'],
            ['eid1/alpha', colorUtils.CHART_COLOR_PALLETE[0]],
            ['eid1/beta', colorUtils.CHART_COLOR_PALLETE[1]],
            ['eid2/beta', colorUtils.CHART_COLOR_PALLETE[1]],
            ['eid2/gamma', colorUtils.CHART_COLOR_PALLETE[1]],
            ['eid2/alpha', colorUtils.NON_MATCHED_COLOR],
            ['eid2/delta', colorUtils.NON_MATCHED_COLOR],
          ])
        );
      });
    });

    it('auto-selects new runs if total num <= N', () => {
      const existingRuns = [buildRun({id: 'existingRun1'})];
      let state = buildRunsState({
        selectionState: new Map([
          ['["b"]', new Map([['existingRun1', false]])],
        ]),
      });

      const fewNewRuns = createFakeRuns(MAX_NUM_RUNS_TO_ENABLE_BY_DEFAULT - 1);
      state = runsReducers.reducers(
        state,
        actions.fetchRunsSucceeded({
          experimentIds: ['b'],
          runsForAllExperiments: [...existingRuns, ...fewNewRuns],
          newRunsAndMetadata: {
            b: {
              runs: fewNewRuns,
              metadata: buildHparamsAndMetadata({}),
            },
          },
        })
      );

      const selections = [...state.data.selectionState.get('["b"]')!.entries()];
      expect(selections.length).toBe(fewNewRuns.length + existingRuns.length);
      // Existing runs that were unselected should remain so.
      const selectedAsExpected = selections.every(([runId, isSelected]) => {
        return isSelected === (runId !== 'existingRun1');
      });
      expect(selectedAsExpected).toBe(true);
    });

    it('does not auto-select new runs if total num > N', () => {
      const existingRuns = [buildRun({id: 'existingRun1'})];
      let state = buildRunsState({
        selectionState: new Map([['["b"]', new Map([['existingRun1', true]])]]),
      });

      const manyNewRuns = createFakeRuns(MAX_NUM_RUNS_TO_ENABLE_BY_DEFAULT);
      state = runsReducers.reducers(
        state,
        actions.fetchRunsSucceeded({
          experimentIds: ['b'],
          runsForAllExperiments: [...existingRuns, ...manyNewRuns],
          newRunsAndMetadata: {
            b: {
              runs: manyNewRuns,
              metadata: buildHparamsAndMetadata({}),
            },
          },
        })
      );

      const selections = [...state.data.selectionState.get('["b"]')!.entries()];
      expect(selections.length).toBe(manyNewRuns.length + existingRuns.length);
      // Existing runs that were selected should remain so.
      const selectedAsExpected = selections.every(([runId, isSelected]) => {
        return isSelected === (runId === 'existingRun1');
      });
      expect(selectedAsExpected).toBe(true);
    });
  });

  describe('runSelectionToggled', () => {
    it('toggles the run selection state for a runId', () => {
      const state = buildRunsState({
        runIds: {eid1: ['r1', 'r2']},
        selectionState: new Map([['["eid1"]', new Map([['foo', true]])]]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runSelectionToggled({
          experimentIds: ['eid1'],
          runId: 'foo',
        })
      );

      expect(nextState.data.selectionState).toEqual(
        new Map([['["eid1"]', new Map([['foo', false]])]])
      );
    });

    it('sets true for previously un-set runId', () => {
      const state = buildRunsState({
        runIds: {eid1: ['r1', 'r2']},
        selectionState: new Map([['["eid1"]', new Map([['foo', true]])]]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runSelectionToggled({
          experimentIds: ['eid1'],
          runId: 'bar',
        })
      );

      expect(nextState.data.selectionState).toEqual(
        new Map([
          [
            '["eid1"]',
            new Map([
              ['foo', true],
              ['bar', true],
            ]),
          ],
        ])
      );
    });
  });

  describe('runPageSelectionToggled', () => {
    it('toggles all items to on when they were all previously off', () => {
      const state = buildRunsState({
        selectionState: new Map([['["eid"]', new Map([['foo', false]])]]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runPageSelectionToggled({
          experimentIds: ['eid'],
          runIds: ['foo', 'bar'],
        })
      );

      expect(nextState.data.selectionState).toEqual(
        new Map([
          [
            '["eid"]',
            new Map([
              ['foo', true],
              ['bar', true],
            ]),
          ],
        ])
      );
    });

    it('toggles all items to on when they were partially off', () => {
      const state = buildRunsState({
        selectionState: new Map([['["eid"]', new Map([['foo', true]])]]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runPageSelectionToggled({
          experimentIds: ['eid'],
          runIds: ['foo', 'bar'],
        })
      );

      expect(nextState.data.selectionState).toEqual(
        new Map([
          [
            '["eid"]',
            new Map([
              ['foo', true],
              ['bar', true],
            ]),
          ],
        ])
      );
    });

    it(
      'toggles all items to on when they were partially off (bar explicitly' +
        'off)',
      () => {
        const state = buildRunsState({
          selectionState: new Map([
            [
              '["eid"]',
              new Map([
                ['foo', true],
                ['bar', false],
              ]),
            ],
          ]),
        });

        const nextState = runsReducers.reducers(
          state,
          actions.runPageSelectionToggled({
            experimentIds: ['eid'],
            runIds: ['foo', 'bar'],
          })
        );

        expect(nextState.data.selectionState).toEqual(
          new Map([
            [
              '["eid"]',
              new Map([
                ['foo', true],
                ['bar', true],
              ]),
            ],
          ])
        );
      }
    );

    it('deselects all items if they were on', () => {
      const state = buildRunsState({
        selectionState: new Map([
          [
            '["eid"]',
            new Map([
              ['foo', true],
              ['bar', true],
            ]),
          ],
        ]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runPageSelectionToggled({
          experimentIds: ['eid'],
          runIds: ['foo', 'bar'],
        })
      );

      expect(nextState.data.selectionState).toEqual(
        new Map([
          [
            '["eid"]',
            new Map([
              ['foo', false],
              ['bar', false],
            ]),
          ],
        ])
      );
    });
  });

  describe('runsSelectAll', () => {
    it('selects all runs', () => {
      const state = buildRunsState({
        runIds: {
          e1: ['r1', 'r2'],
          e2: ['r3'],
        },
        selectionState: new Map([['["e1","e2"]', new Map([['r1', false]])]]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runsSelectAll({
          experimentIds: ['e1', 'e2'],
        })
      );

      expect(nextState.data.selectionState).toEqual(
        new Map([
          [
            '["e1","e2"]',
            new Map([
              ['r1', true],
              ['r2', true],
              ['r3', true],
            ]),
          ],
        ])
      );
    });
  });

  describe('runSelectorPaginationOptionChanged', () => {
    it('updates the pagination option', () => {
      const state = buildRunsState(undefined, {
        paginationOption: {
          pageSize: 20,
          pageIndex: 2,
        },
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runSelectorPaginationOptionChanged({
          pageSize: 10,
          pageIndex: 0,
        })
      );

      expect(nextState.ui.paginationOption).toEqual({
        pageSize: 10,
        pageIndex: 0,
      });
    });
  });

  describe('runSelectorRegexFilterChanged', () => {
    it('updates the regex filter', () => {
      const state = buildRunsState(
        {
          regexFilter: 'foo',
        },
        undefined
      );

      const nextState = runsReducers.reducers(
        state,
        actions.runSelectorRegexFilterChanged({regexString: 'foo rocks'})
      );

      expect(nextState.data.regexFilter).toBe('foo rocks');
    });

    it('resets the pagination index', () => {
      const state = buildRunsState(
        {regexFilter: 'foo'},
        {
          paginationOption: {
            pageSize: 10,
            pageIndex: 100,
          },
        }
      );

      const nextState = runsReducers.reducers(
        state,
        actions.runSelectorRegexFilterChanged({regexString: 'bar'})
      );

      expect(nextState.ui.paginationOption.pageIndex).toBe(0);
    });
  });

  describe('runSelectorSortChanged', () => {
    it('updates the sort changed', () => {
      const state = buildRunsState(undefined, {
        sort: {
          key: null,
          direction: SortDirection.UNSET,
        },
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runSelectorSortChanged({
          key: {type: SortType.EXPERIMENT_NAME},
          direction: SortDirection.ASC,
        })
      );

      expect(nextState.ui.sort).toEqual({
        key: {type: SortType.EXPERIMENT_NAME},
        direction: SortDirection.ASC,
      });
    });
  });

  describe('runColorChanged', () => {
    it('updates color for the run', () => {
      const state = buildRunsState({
        runColorOverrideForGroupBy: new Map([['foo', '#aaa']]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runColorChanged({
          runId: 'foo',
          newColor: '#000',
        })
      );

      expect(nextState.data.runColorOverrideForGroupBy).toEqual(
        new Map([['foo', '#000']])
      );
    });

    it('sets run color for a value that did not exist', () => {
      const state = buildRunsState({
        runColorOverrideForGroupBy: new Map([['foo', '#aaa']]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runColorChanged({
          runId: 'bar',
          newColor: '#fff',
        })
      );

      expect(nextState.data.runColorOverrideForGroupBy).toEqual(
        new Map([
          ['foo', '#aaa'],
          ['bar', '#fff'],
        ])
      );
    });
  });

  describe('on runGroupByChanged', () => {
    it('reassigns color to EXPERIMENT from RUN', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.RUN},
        runIds: {
          eid1: ['run1', 'run2'],
          eid2: ['run3', 'run4'],
        },
        runIdToExpId: {
          run1: 'eid1',
          run2: 'eid1',
          run3: 'eid2',
          run4: 'eid2',
        },
        runMetadata: {
          run1: buildRun({id: 'run1'}),
          run2: buildRun({id: 'run2'}),
          run3: buildRun({id: 'run3'}),
          run4: buildRun({id: 'run4'}),
        },
        groupKeyToColorString: new Map([
          ['run1', '#aaa'],
          ['run2', '#bbb'],
          ['run3', '#ccc'],
          ['run4', '#ddd'],
        ]),
        defaultRunColorForGroupBy: new Map([
          ['run1', '#aaa'],
          ['run2', '#bbb'],
          ['run3', '#ccc'],
          ['run4', '#ddd'],
        ]),
        runColorOverrideForGroupBy: new Map([['run1', '#aaa']]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runGroupByChanged({
          experimentIds: ['eid1', 'eid2'],
          groupBy: {key: GroupByKey.EXPERIMENT},
        })
      );

      expect(nextState.data.initialGroupBy).toEqual({key: GroupByKey.RUN});
      expect(nextState.data.userSetGroupByKey).toEqual(GroupByKey.EXPERIMENT);
      expect(nextState.data.groupKeyToColorString).toEqual(
        new Map([
          ['eid1', colorUtils.CHART_COLOR_PALLETE[0]],
          ['eid2', colorUtils.CHART_COLOR_PALLETE[1]],
        ])
      );
      expect(nextState.data.defaultRunColorForGroupBy).toEqual(
        new Map([
          ['run1', colorUtils.CHART_COLOR_PALLETE[0]],
          ['run2', colorUtils.CHART_COLOR_PALLETE[0]],
          ['run3', colorUtils.CHART_COLOR_PALLETE[1]],
          ['run4', colorUtils.CHART_COLOR_PALLETE[1]],
        ])
      );
      expect(nextState.data.runColorOverrideForGroupBy).toEqual(new Map());
    });

    it('reassigns color to RUN from EXPERIMENT', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.EXPERIMENT},
        userSetGroupByKey: GroupByKey.EXPERIMENT,
        runIds: {
          eid1: ['run1', 'run2'],
          eid2: ['run3', 'run4'],
        },
        runIdToExpId: {
          run1: 'eid1',
          run2: 'eid1',
          run3: 'eid2',
          run4: 'eid2',
        },
        runMetadata: {
          run1: buildRun({id: 'run1'}),
          run2: buildRun({id: 'run2'}),
          run3: buildRun({id: 'run3'}),
          run4: buildRun({id: 'run4'}),
        },
        groupKeyToColorString: new Map([
          ['eid1', '#aaa'],
          ['eid2', '#bbb'],
        ]),
        defaultRunColorForGroupBy: new Map([
          ['run1', '#aaa'],
          ['run2', '#aaa'],
          ['run3', '#bbb'],
          ['run4', '#bbb'],
        ]),
        runColorOverrideForGroupBy: new Map([['run1', '#ccc']]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runGroupByChanged({
          experimentIds: ['eid1', 'eid2'],
          groupBy: {key: GroupByKey.RUN},
        })
      );

      expect(nextState.data.userSetGroupByKey).toEqual(GroupByKey.RUN);
      expect(nextState.data.groupKeyToColorString).toEqual(
        new Map([
          ['run1', colorUtils.CHART_COLOR_PALLETE[0]],
          ['run2', colorUtils.CHART_COLOR_PALLETE[1]],
          ['run3', colorUtils.CHART_COLOR_PALLETE[2]],
          ['run4', colorUtils.CHART_COLOR_PALLETE[3]],
        ])
      );
      expect(nextState.data.defaultRunColorForGroupBy).toEqual(
        new Map([
          ['run1', colorUtils.CHART_COLOR_PALLETE[0]],
          ['run2', colorUtils.CHART_COLOR_PALLETE[1]],
          ['run3', colorUtils.CHART_COLOR_PALLETE[2]],
          ['run4', colorUtils.CHART_COLOR_PALLETE[3]],
        ])
      );
      expect(nextState.data.runColorOverrideForGroupBy).toEqual(new Map());
    });

    it('reassigns color to REGEX from RUN', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.RUN},
        runIds: {
          eid1: ['run1', 'run2'],
          eid2: ['run3', 'run4', 'run5', 'run6'],
        },
        runIdToExpId: {
          run1: 'eid1',
          run2: 'eid1',
          run3: 'eid2',
          run4: 'eid2',
          run5: 'eid2',
          run6: 'eid2',
        },
        runMetadata: {
          run1: buildRun({id: 'run1', name: 'foo1bar1'}),
          run2: buildRun({id: 'run2', name: 'foo2bar1'}),
          run3: buildRun({id: 'run3', name: 'foo2bar2'}),
          run4: buildRun({id: 'run4', name: 'foo2bar2bar'}),
          run5: buildRun({id: 'run5', name: 'beta'}),
          run6: buildRun({id: 'run6', name: 'gamma'}),
        },
        defaultRunColorForGroupBy: new Map([
          ['run1', '#aaa'],
          ['run2', '#bbb'],
          ['run3', '#ccc'],
          ['run4', '#ddd'],
          ['run5', '#eee'],
          ['run6', '#fff'],
        ]),
      });

      const nextState = runsReducers.reducers(
        state,
        actions.runGroupByChanged({
          experimentIds: ['eid1', 'eid2'],
          groupBy: {key: GroupByKey.REGEX, regexString: 'foo(\\d+)'},
        })
      );

      expect(nextState.data.userSetGroupByKey).toEqual(GroupByKey.REGEX);
      expect(nextState.data.groupKeyToColorString).toEqual(
        new Map([
          ['["1"]', colorUtils.CHART_COLOR_PALLETE[0]],
          ['["2"]', colorUtils.CHART_COLOR_PALLETE[1]],
        ])
      );
      expect(nextState.data.defaultRunColorForGroupBy).toEqual(
        new Map([
          ['run1', colorUtils.CHART_COLOR_PALLETE[0]],
          ['run2', colorUtils.CHART_COLOR_PALLETE[1]],
          ['run3', colorUtils.CHART_COLOR_PALLETE[1]],
          ['run4', colorUtils.CHART_COLOR_PALLETE[1]],
          ['run5', colorUtils.NON_MATCHED_COLOR],
          ['run6', colorUtils.NON_MATCHED_COLOR],
        ])
      );
      expect(nextState.data.runColorOverrideForGroupBy).toEqual(new Map());
      expect(nextState.data.colorGroupRegexString).toBe('foo(\\d+)');
    });

    it('preserves regexString when reassigning color to RUN from REGEX', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.RUN},
        runIds: {
          eid1: ['run1', 'run2'],
          eid2: ['run3', 'run4', 'run5', 'run6'],
        },
        runIdToExpId: {
          run1: 'eid1',
          run2: 'eid1',
          run3: 'eid2',
          run4: 'eid2',
          run5: 'eid2',
          run6: 'eid2',
        },
        runMetadata: {
          run1: buildRun({id: 'run1', name: 'foo1bar1'}),
          run2: buildRun({id: 'run2', name: 'foo2bar1'}),
          run3: buildRun({id: 'run3', name: 'foo2bar2'}),
          run4: buildRun({id: 'run4', name: 'foo2bar2bar'}),
          run5: buildRun({id: 'run5', name: 'beta'}),
          run6: buildRun({id: 'run6', name: 'gamma'}),
        },
        defaultRunColorForGroupBy: new Map([
          ['run1', '#aaa'],
          ['run2', '#bbb'],
          ['run3', '#ccc'],
          ['run4', '#ddd'],
          ['run5', '#eee'],
          ['run6', '#fff'],
        ]),
      });

      const state2 = runsReducers.reducers(
        state,
        actions.runGroupByChanged({
          experimentIds: ['eid1', 'eid2'],
          groupBy: {key: GroupByKey.REGEX, regexString: 'initial regex string'},
        })
      );
      const state3 = runsReducers.reducers(
        state2,
        actions.runGroupByChanged({
          experimentIds: ['eid1', 'eid2'],
          groupBy: {key: GroupByKey.RUN},
        })
      );

      expect(state3.data.colorGroupRegexString).toBe('initial regex string');

      // Updates colorGroupRegexString with new regexString when type GroupBy is RegexGroupBy
      const state4 = runsReducers.reducers(
        state3,
        actions.runGroupByChanged({
          experimentIds: ['eid1', 'eid2'],
          groupBy: {key: GroupByKey.REGEX, regexString: 'updated regexString'},
        })
      );
      expect(state4.data.colorGroupRegexString).toBe('updated regexString');
    });
  });

  describe('#stateRehydratedFromUrl', () => {
    it('ignores non-dashboard routeKind', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.EXPERIMENT},
        userSetGroupByKey: GroupByKey.RUN,
      });

      const nextState = runsReducers.reducers(
        state,
        stateRehydratedFromUrl({
          routeKind: RouteKind.EXPERIMENTS,
          partialState: {
            runs: {
              groupBy: {
                key: GroupByKey.EXPERIMENT,
              },
            },
          },
        })
      );

      expect(nextState.data.userSetGroupByKey).toEqual(GroupByKey.RUN);
    });

    it('sets userSetGroupBy to the value provided', () => {
      const state = buildRunsState({
        colorGroupRegexString: '',
        initialGroupBy: {key: GroupByKey.REGEX, regexString: ''},
        userSetGroupByKey: GroupByKey.RUN,
      });

      const partialState: URLDeserializedState = {
        runs: {
          groupBy: {key: GroupByKey.EXPERIMENT},
        },
      };
      const nextState = runsReducers.reducers(
        state,
        stateRehydratedFromUrl({
          routeKind: RouteKind.EXPERIMENT,
          partialState,
        })
      );

      expect(nextState.data.userSetGroupByKey).toEqual(GroupByKey.EXPERIMENT);
    });

    it('ignores the action if the partialState does not contain groupBy', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.EXPERIMENT},
        userSetGroupByKey: GroupByKey.RUN,
      });

      const partialState: URLDeserializedState = {
        runs: {
          groupBy: null,
        },
      };
      const nextState = runsReducers.reducers(
        state,
        stateRehydratedFromUrl({
          routeKind: RouteKind.EXPERIMENT,
          partialState,
        })
      );

      expect(nextState.data.userSetGroupByKey).toEqual(GroupByKey.RUN);
    });

    it('does not change the default colors by the new groupBy', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.EXPERIMENT},
        userSetGroupByKey: GroupByKey.RUN,
        runIds: {
          eid1: ['run1', 'run2'],
          eid2: ['run3', 'run4'],
        },
        runIdToExpId: {
          run1: 'eid1',
          run2: 'eid1',
          run3: 'eid2',
          run4: 'eid2',
        },
        runMetadata: {
          run1: buildRun({id: 'run1'}),
          run2: buildRun({id: 'run2'}),
          run3: buildRun({id: 'run3'}),
          run4: buildRun({id: 'run4'}),
        },
        groupKeyToColorString: new Map([
          ['run1', '#aaa'],
          ['run2', '#bbb'],
          ['run3', '#ccc'],
          ['run4', '#ddd'],
        ]),
        defaultRunColorForGroupBy: new Map([
          ['run1', '#aaa'],
          ['run2', '#bbb'],
          ['run3', '#ccc'],
          ['run4', '#ddd'],
        ]),
        runColorOverrideForGroupBy: new Map([['run1', '#ccc']]),
      });

      const partialState: URLDeserializedState = {
        runs: {
          groupBy: {key: GroupByKey.EXPERIMENT},
        },
      };
      const nextState = runsReducers.reducers(
        state,
        stateRehydratedFromUrl({
          routeKind: RouteKind.COMPARE_EXPERIMENT,
          partialState,
        })
      );

      expect(nextState.data.defaultRunColorForGroupBy).toEqual(
        new Map([
          ['run1', '#aaa'],
          ['run2', '#bbb'],
          ['run3', '#ccc'],
          ['run4', '#ddd'],
        ])
      );
      expect(nextState.data.groupKeyToColorString).toEqual(
        new Map([
          ['run1', '#aaa'],
          ['run2', '#bbb'],
          ['run3', '#ccc'],
          ['run4', '#ddd'],
        ])
      );
    });

    it('sets regexString on groupBy REGEX', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.EXPERIMENT},
      });

      const partialState: URLDeserializedState = {
        runs: {
          groupBy: {key: GroupByKey.REGEX, regexString: 'regex string'},
        },
      };
      const nextState = runsReducers.reducers(
        state,
        stateRehydratedFromUrl({
          routeKind: RouteKind.COMPARE_EXPERIMENT,
          partialState,
        })
      );

      expect(nextState.data.colorGroupRegexString).toBe('regex string');
    });
  });

  describe('when freshly navigating', () => {
    it('sets initial groupby to EXPERIMENT on experiment comparion', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.RUN},
      });

      const nextState = runsReducers.reducers(
        state,
        navigated({
          before: buildRoute({
            routeKind: RouteKind.EXPERIMENT,
          }),
          after: buildCompareRoute(['eid1:run1', 'eid1:run2']),
        })
      );

      expect(nextState.data.initialGroupBy.key).toBe(GroupByKey.EXPERIMENT);
    });

    it('preserves userSetGroupByKey set on prior navigation to the same route', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.EXPERIMENT},
        userSetGroupByKey: GroupByKey.RUN,
      });

      const state2 = runsReducers.reducers(
        state,
        navigated({
          before: buildCompareRoute(['eid1:run1', 'eid2:run2']),
          after: buildCompareRoute(['eid3:run3', 'eid4:run4']),
        })
      );

      const state3 = runsReducers.reducers(
        state2,
        navigated({
          before: buildCompareRoute(['eid3:run3', 'eid4:run4']),
          after: buildCompareRoute(['eid1:run1', 'eid2:run2']),
        })
      );

      expect(state3.data.initialGroupBy.key).toBe(GroupByKey.EXPERIMENT);
      expect(state3.data.userSetGroupByKey).toBe(GroupByKey.RUN);
    });

    it('sets groupby to RUN on single experiment', () => {
      const state = buildRunsState({
        initialGroupBy: {key: GroupByKey.REGEX, regexString: 'test'},
      });

      const nextState = runsReducers.reducers(
        state,
        navigated({
          before: buildCompareRoute(['eid1:run1', 'eid2:run2']),
          after: buildRoute({
            routeKind: RouteKind.EXPERIMENT,
          }),
        })
      );

      expect(nextState.data.initialGroupBy.key).toBe(GroupByKey.RUN);
    });
  });
});
