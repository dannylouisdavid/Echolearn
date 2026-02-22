import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';

interface WeeklyProgressChartProps {
    data: { day: string; minutes: number }[];
}

export default function WeeklyProgressChart({ data }: WeeklyProgressChartProps) {
    const screenWidth = Dimensions.get('window').width;
    const chartWidth = screenWidth - 60; // Padding
    const chartHeight = 180;
    const paddingBottom = 30;
    const paddingLeft = 30;

    if (!data || data.length === 0) {
        return <View style={styles.container}><Text style={{ color: '#666' }}>No data available</Text></View>;
    }

    // Find max value for scaling
    const maxMinutes = Math.max(...data.map(d => d.minutes), 60); // Min 60 mins for scale
    const scaleY = (chartHeight - paddingBottom) / maxMinutes;
    const stepX = (chartWidth - paddingLeft) / (data.length - 1);

    // Create Path
    let pathD = `M ${paddingLeft} ${chartHeight - paddingBottom - (data[0].minutes * scaleY)}`;
    data.forEach((d, i) => {
        if (i === 0) return;
        const x = paddingLeft + (i * stepX);
        const y = chartHeight - paddingBottom - (d.minutes * scaleY);
        pathD += ` L ${x} ${y}`;
    });

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Time Spent (Last 7 Days)</Text>
            <Svg width={chartWidth} height={chartHeight}>
                {/* Horizontal Grid Lines */}
                {[0, 0.5, 1].map((ratio) => {
                    const y = chartHeight - paddingBottom - (maxMinutes * ratio * scaleY);
                    return (
                        <React.Fragment key={ratio}>
                            <Line x1={paddingLeft} y1={y} x2={chartWidth} y2={y} stroke="#333" strokeWidth="1" />
                            <SvgText x={0} y={y + 4} fill="#666" fontSize="10" textAnchor="start">
                                {Math.round(maxMinutes * ratio)}m
                            </SvgText>
                        </React.Fragment>
                    );
                })}

                {/* The Line */}
                <Path d={pathD} stroke="#35c128" strokeWidth="3" fill="none" />

                {/* Data Points & Labels */}
                {data.map((d, i) => {
                    const x = paddingLeft + (i * stepX);
                    const y = chartHeight - paddingBottom - (d.minutes * scaleY);
                    return (
                        <React.Fragment key={i}>
                            <Circle cx={x} cy={y} r="4" fill="#35c128" />
                            <SvgText x={x} y={chartHeight - 10} fill="#aaa" fontSize="10" textAnchor="middle">
                                {d.day}
                            </SvgText>
                        </React.Fragment>
                    );
                })}
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 15,
        marginVertical: 10,
        alignItems: 'center'
    },
    title: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 15,
        alignSelf: 'flex-start'
    }
});
