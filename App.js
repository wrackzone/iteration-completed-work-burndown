// <script type="text/javascript" src="https://rally1.rallydev.com/apps/2.0rc1/sdk-debug.js"></script>
// <script type="text/javascript" src="https://rally1.rallydev.com/apps/2.0rc1/lib/analytics/analytics-all.js"></script>


Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items: [
        {
            xtype: 'container',
            itemId: 'iterationDropDown',
            columnWidth: 1
        }
        ,
        {
            xtype: 'container',
            itemId: 'chart1',
            columnWidth: 1
        }    
    ],
    launch: function() {
        
        // get the timebox scope for the page
        var timeboxScope = this.getContext().getTimeboxScope();
        if(timeboxScope) {
            var record = timeboxScope.getRecord();
            var name = record.get('Name');
            
            this.gIteration = record.data;
            this._onIterationSelect();
            // var startDate = timeboxScope.getType() === 'iteration' ? 
            //     record.get('StartDate') : record.get('ReleaseStartDate');
        } else {
            // add the iteration dropdown selector
            this.down("#iterationDropDown").add( {
                xtype: 'rallyiterationcombobox',
                itemId : 'iterationSelector',
                listeners: {
                        select: this._onIterationSelect,
                        ready:  this._onIterationSelect,
                        scope:  this
                }
            });
        }
        // used to save the selected release
    },
    onTimeboxScopeChange: function(newTimeboxScope) {
        this.callParent(arguments);
        
        if(newTimeboxScope) {
            var record = newTimeboxScope.getRecord();
            
            this.gIteration = record.data;
            this._onIterationSelect();
        }
    },
    
    _onIterationSelect : function() {
        
        if (_.isUndefined( this.getContext().getTimeboxScope())) {
            var value =  this.down('#iterationSelector').getRecord();
            this.gIteration = value.data;
        } 
        
        var iterationId = this.gIteration.ObjectID;
        
        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : true,
            limit: Infinity,
            listeners: {
                load: this._onIterationSnapShotData,
                scope : this
            },
            fetch: ['ObjectID','Name', 'Priority','ScheduleState', 'PlanEstimate','TaskEstimateTotal','TaskRemainingTotal'],
            hydrate: ['ScheduleState'],
            filters: [
                {
                    property: '_TypeHierarchy',
                    operator: 'in',
                    value: ['Defect','HierarchicalRequirement']
                },
                {
                    property: 'Iteration',
                    operator: 'in',
                    value: iterationId
                }
            ]
        });        
    },
    _onIterationSnapShotData : function(store,data,success) {
        
        var lumenize = window.parent.Rally.data.lookback.Lumenize;
        var snapShotData = _.map(data,function(d){return d.data});      

        var metrics = [
            {as: 'TaskTotal', f: 'sum', field : 'TaskEstimateTotal'},
            {as: 'TaskToDo' ,  f: 'sum', field : 'TaskRemainingTotal'}, 
            {as: 'Completed',  f: 'filteredSum', field : 'PlanEstimate', filterField : 'ScheduleState', filterValues : ['Completed']},
            {as: 'Accepted',  f: 'filteredSum', field : 'PlanEstimate', filterField : 'ScheduleState', filterValues : ['Accepted']},
            {as: 'TotalScope',  f: 'sum', field : 'PlanEstimate'}
        ];
        
        var derivedFieldsAfterSummary = [
            {   as: 'Ideal', 
                f : function (row,index,summaryMetrics, seriesData) {
                    var max = seriesData[0].TaskTotal;
                    var increments = seriesData.length - 1;
                    var incAmount = max / increments;
                    var ideal = Math.floor(100 * (max - index * incAmount)) / 100;
                    return ideal > 0 ? ideal : 0;
                }
            }
        ];
        
        var config = {
          deriveFieldsOnInput: [],
          metrics: metrics,
          summaryMetricsConfig: [],
          deriveFieldsAfterSummary: derivedFieldsAfterSummary,
          granularity: lumenize.Time.DAY,
          tz: 'America/New_York',
          holidays: [],
          workDays: 'Monday,Tuesday,Wednesday,Thursday,Friday'
        };
    
        // release start and end dates
        var startOnISOString = new lumenize.Time(this.gIteration.StartDate).getISOStringInTZ(config.tz)
        var upToDateISOString = new lumenize.Time(this.gIteration.EndDate).getISOStringInTZ(config.tz)

        calculator = new lumenize.TimeSeriesCalculator(config);
        calculator.addSnapshots(snapShotData, startOnISOString, upToDateISOString);

        // create a high charts series config object, used to get the hc series data
        var hcConfig = [{ name: "label" }, 
            { name : "TaskTotal" }, 
            { name : "TaskToDo",}, 
            { name : "Ideal", color : "#FF0000"}, 
            { name : 'Completed', type : 'column', yAxis:1 }, 
            { name : 'Accepted',type : 'column', yAxis:1 },
            { name : 'TotalScope',type : 'column', yAxis:1 }
        ];
        var hc = lumenize.arrayOfMaps_To_HighChartsSeries(calculator.getResults().seriesData, hcConfig);

        // display the chart
        this._showChart(hc);
    },

    _showChart : function(series) {
              
        var chart = this.down("#chart1");
        chart.removeAll();
        
        series[1].data = _.map(series[1].data, function(d) { return _.isNull(d) ? 0 : d; });
        
        var extChart = Ext.create('Rally.ui.chart.Chart', {
            // width: 800,
            // height: 500,
         chartData: {
            categories : series[0].data,
            series : [
                series[1],
                series[2],
                series[3],
                //{ name : "Ideal", data : series[3].data, color : "Black" },
                series[4],
                series[5]
            ]
         },
          chartConfig : {
                colors : ["DarkGreen","LightGreen","Black"],
                chart: {
                },
                title: {
                text: '',
                x: -20 //center
                },                        
                xAxis: {
                    //tickInterval : 2,
                    labels: {
                        formatter: function() {
                            var d = new Date(this.value);
                            return ""+(d.getMonth()+1)+"/"+d.getDate();
                        }
                    }
                },
                yAxis: [{
                    min : 0,
                    title: {
                        text: 'Hours'
                    },
                    plotLines: [{
                        value: 0,
                        width: 1,
                        color: '#808080'
                    }]
                },
                {
                    title: {
                        text: 'Story Points'
                    },
                    plotLines: [{
                        value: 0,
                        width: 1,
                        color: '#808080'
                    }],
                    opposite : true
                }
                ],
                tooltip: {
                    valueSuffix: ''
                },
                legend: {
                            align: 'center',
                            verticalAlign: 'bottom'
                },
                plotOptions : {
                 column: {
                    stacking: 'normal',
                    tooltip : {
                        valueSuffix : ' points'
                    }
                 },
                 line : {
                    zIndex : 1,
                    tooltip : {
                        valueSuffix : ' hours'
                    }

                 }
                }
            }
        });
        chart.add(extChart);
        var p = Ext.get(chart.id);
        var elems = p.query("div.x-mask");
        _.each(elems, function(e) { e.remove(); });
        var elems = p.query("div.x-mask-msg");
        _.each(elems, function(e) { e.remove(); });
    }            
});
