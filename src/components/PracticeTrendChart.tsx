"use client";

import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { useMemo } from 'react';

type TrendData = {
  turnNumber: number;
  score: number;
  avg: number;
};

type PracticeTrendChartProps = {
  sessionData: TrendData[];
  overallAvg?: number;
  matchAvg?: number;
  title: string;
  height?: number;
};

export default function PracticeTrendChart({
  sessionData,
  overallAvg,
  matchAvg,
  title,
  height = 200,
}: PracticeTrendChartProps) {
  const options = useMemo(() => {
    if (!sessionData || sessionData.length === 0) {
      return {
        chart: { height },
        title: { text: title },
        series: [],
        credits: { enabled: false }
      };
    }
    
    const scores = sessionData.map(d => [d.turnNumber, d.score]);
    const avgLine = sessionData.map(d => [d.turnNumber, d.avg]);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = [
      {
        name: 'Turn Score',
        data: scores,
        type: 'column',
        color: 'rgba(59, 130, 246, 0.6)',
        yAxis: 0,
      },
      {
        name: 'Session Average',
        data: avgLine,
        type: 'line',
        color: '#10b981',
        lineWidth: 2,
        marker: { enabled: false },
        yAxis: 0,
      }
    ];

    // Add overall average line if provided
    if (overallAvg && sessionData.length > 0) {
      const overallLine = sessionData.map(d => [d.turnNumber, overallAvg]);
      series.push({
        name: 'Overall Practice Avg',
        data: overallLine,
        type: 'line',
        color: '#f59e0b',
        lineWidth: 2,
        marker: { enabled: false },
        dashStyle: 'dash',
        yAxis: 0,
      });
    }

    // Add match average line if provided
    if (matchAvg && sessionData.length > 0) {
      const matchLine = sessionData.map(d => [d.turnNumber, matchAvg]);
      series.push({
        name: 'Match Average',
        data: matchLine,
        type: 'line',
        color: '#ef4444',
        lineWidth: 2,
        marker: { enabled: false },
        dashStyle: 'longdash',
        yAxis: 0,
      });
    }

    return {
      chart: {
        height,
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: title,
        style: {
          fontSize: '14px',
          fontWeight: '600'
        }
      },
      xAxis: {
        title: {
          text: 'Turn',
          style: { fontSize: '12px' }
        },
        gridLineWidth: 1,
        gridLineColor: 'rgba(148, 163, 184, 0.2)',
      },
      yAxis: {
        title: {
          text: 'Score',
          style: { fontSize: '12px' }
        },
        min: 0,
        max: 180,
        gridLineColor: 'rgba(148, 163, 184, 0.2)',
      },
      legend: {
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: {
          fontSize: '11px'
        }
      },
      series,
      credits: { enabled: false },
      tooltip: {
        shared: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: function(this: any): string {
          let tooltip = `<b>Turn ${this.x}</b><br/>`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.points?.forEach((point: any) => {
            tooltip += `<span style="color:${point.color}">●</span> ${point.series.name}: <b>${point.y}</b><br/>`;
          });
          return tooltip;
        }
      },
      plotOptions: {
        column: {
          borderWidth: 0,
          borderRadius: 2,
        },
        line: {
          marker: {
            enabled: false,
            states: {
              hover: {
                enabled: true,
                radius: 4
              }
            }
          }
        }
      }
    };
  }, [sessionData, overallAvg, matchAvg, title, height]);

  if (!sessionData || sessionData.length === 0) {
    return (
      <div 
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No data to display
      </div>
    );
  }

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}