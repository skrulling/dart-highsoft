"use client";
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function Chart({ options }: { options: any }) {
  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
