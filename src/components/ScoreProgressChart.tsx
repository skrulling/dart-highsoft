import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { useMemo } from 'react';

type Player = { id: string; display_name: string };
type TurnRecord = {
  id: string;
  leg_id: string;
  player_id: string;
  turn_number: number;
  total_scored: number;
  busted: boolean;
  tiebreak_round: number | null;
};

interface ScoreProgressChartProps {
  players: Player[];
  turns: TurnRecord[];
  startScore: number;
  currentLegId?: string;
}

export function ScoreProgressChart({ players, turns, startScore, currentLegId }: ScoreProgressChartProps) {
  const chartData = useMemo(() => {
    if (!currentLegId || !players.length) return [];

    const turnsByPlayer = new Map<string, TurnRecord[]>();
    for (const player of players) {
      turnsByPlayer.set(player.id, []);
    }

    for (const turn of turns) {
      if (turn.leg_id !== currentLegId) continue;
      if (turn.tiebreak_round != null) continue;
      const playerTurns = turnsByPlayer.get(turn.player_id);
      if (playerTurns) {
        playerTurns.push(turn);
      }
    }

    // Create data series for each player
    return players.map((player) => {
      const playerTurns = (turnsByPlayer.get(player.id) ?? []).slice().sort((a, b) => a.turn_number - b.turn_number);

      // Calculate score progression
      const data: [number, number][] = [[0, startScore]]; // Start with initial score at round 0
      let currentScore = startScore;

      playerTurns.forEach((turn, index) => {
        if (!turn.busted) {
          currentScore = Math.max(0, currentScore - turn.total_scored);
        }
        // Add data point for this round (round number is index + 1)
        data.push([index + 1, currentScore]);
      });

      return {
        name: player.display_name,
        data: data,
        type: 'line' as const,
        lineWidth: 3,
        marker: {
          radius: 5,
          symbol: 'circle',
        },
      };
    });
  }, [players, turns, startScore, currentLegId]);

  const options = useMemo<Highcharts.Options>(
    () => ({
      title: {
        text: undefined, // Remove title since it's handled by the card header
      },
      subtitle: {
        text: undefined,
      },
      chart: {
        type: 'line',
        height: 450,
        backgroundColor: 'transparent',
        spacing: [10, 10, 10, 10],
        style: {
          fontFamily: 'inherit',
        },
      },
      xAxis: {
        title: {
          text: 'Round',
          style: {
            fontSize: '14px',
            fontWeight: '600',
            color: 'hsl(var(--muted-foreground))',
          },
        },
        min: 0,
        tickInterval: 1,
        gridLineWidth: 1,
        gridLineColor: 'hsl(var(--border))',
        lineColor: 'hsl(var(--border))',
        tickColor: 'hsl(var(--border))',
        labels: {
          style: {
            fontSize: '12px',
            color: 'hsl(var(--muted-foreground))',
          },
        },
      },
      yAxis: {
        title: {
          text: 'Remaining Score',
          style: {
            fontSize: '14px',
            fontWeight: '600',
            color: 'hsl(var(--muted-foreground))',
          },
        },
        min: 0,
        max: startScore,
        gridLineColor: 'hsl(var(--border))',
        lineColor: 'hsl(var(--border))',
        tickColor: 'hsl(var(--border))',
        labels: {
          style: {
            fontSize: '12px',
            color: 'hsl(var(--muted-foreground))',
          },
        },
      },
      legend: {
        align: 'center',
        verticalAlign: 'bottom',
        layout: 'horizontal',
        itemStyle: {
          fontWeight: '500',
          fontSize: '13px',
          color: 'hsl(var(--foreground))',
        },
        itemHoverStyle: {
          color: 'hsl(var(--primary))',
        },
        backgroundColor: 'transparent',
        borderWidth: 0,
        margin: 20,
      },
      plotOptions: {
        line: {
          marker: {
            enabled: true,
            radius: 4,
            states: {
              hover: {
                radiusPlus: 3,
                lineWidthPlus: 1,
              },
            },
          },
          states: {
            hover: {
              lineWidthPlus: 1,
            },
          },
          lineWidth: 3,
          animation: {
            duration: 500,
          },
        },
      },
      tooltip: {
        shared: true,
        backgroundColor: 'hsl(var(--background))',
        borderColor: 'hsl(var(--border))',
        borderRadius: 8,
        borderWidth: 1,
        shadow: {
          color: 'rgba(0, 0, 0, 0.1)',
          offsetX: 0,
          offsetY: 2,
          opacity: 0.1,
          width: 4,
        },
        style: {
          fontSize: '13px',
          color: 'hsl(var(--foreground))',
        },
        formatter: function () {
          const round = this.x;
          let tooltip = `<div style="font-weight: 600; margin-bottom: 4px;">Round ${round}</div>`;

          this.points?.forEach((point) => {
            const color = point.series.color;
            tooltip += `<div style="margin: 2px 0;">
            <span style="color:${color}; font-size: 14px;">●</span> 
            ${point.series.name}: <strong>${point.y}</strong>
          </div>`;
          });

          return tooltip;
        },
      },
      series: chartData,
      colors: [
        'hsl(221, 83%, 53%)', // blue
        'hsl(0, 84%, 60%)', // red
        'hsl(142, 76%, 36%)', // green
        'hsl(38, 92%, 50%)', // amber
        'hsl(248, 53%, 58%)', // violet
        'hsl(188, 94%, 43%)', // cyan
        'hsl(24, 95%, 53%)', // orange
        'hsl(84, 81%, 44%)', // lime
      ],
      credits: {
        enabled: false,
      },
      responsive: {
        rules: [
          {
            condition: {
              maxWidth: 768,
            },
            chartOptions: {
              chart: {
                height: 300,
              },
              legend: {
                layout: 'horizontal',
                align: 'center',
                verticalAlign: 'bottom',
              },
              yAxis: {
                title: {
                  text: 'Score',
                },
              },
              xAxis: {
                title: {
                  text: 'Round',
                },
              },
            },
          },
        ],
      },
    }),
    [chartData, startScore]
  );

  return (
    <div className="w-full">
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        immutable={false}
        updateArgs={[true, true, true]}
      />
    </div>
  );
}
