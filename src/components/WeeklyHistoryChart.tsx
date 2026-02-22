import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText, G } from 'react-native-svg';

interface WeeklyDataPoint {
    day: string; // e.g. "Mon"
    spent: number;
    allocated: number;
}

interface WeeklyHistoryChartProps {
    data: WeeklyDataPoint[];
}

export default function WeeklyHistoryChart({ data }: WeeklyHistoryChartProps) {
    const screenWidth = Dimensions.get('window').width;
    const chartWidth = screenWidth - 40;
    const chartHeight = 220;
    const paddingBottom = 30;
    const paddingLeft = 30;
    const paddingRight = 10;
    const paddingTop = 20;

    // Calculate max value for scaling
    const allValues = data.flatMap(d => [d.spent, d.allocated]);
    const maxValue = Math.max(...allValues, 60); // Min scale 60
    const scaleY = (chartHeight - paddingBottom - paddingTop) / maxValue;

    // X-axis layout
    // We have 7 groups.
    const availableWidth = chartWidth - paddingLeft - paddingRight;
    const groupWidth = availableWidth / data.length;
    const barWidth = 8;
    const spacing = 4; // space between spent/allocated bars

    // Each group has: [Spent Bar] [Space] [Allocated Bar]
    // Center the pair in the groupWidth

    return (
        <View style={styles.container}>
            {/* Legend */}
            <View style={styles.heading}>
                <View style={styles.legend}>
                    <View style={styles.legendItem}>
                        <View style={[styles.dot, { backgroundColor: '#35c128' }]} />
                        <Text style={styles.legendText}>Spent</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.dot, { backgroundColor: '#2196F3' }]} />
                        <Text style={styles.legendText}>Allocated</Text>
                    </View>
                </View>
            </View>

            <Svg width={chartWidth} height={chartHeight}>
                {/* Horizontal Grid Lines */}
                {[0, 0.5, 1].map((ratio) => {
                    const y = chartHeight - paddingBottom - (maxValue * ratio * scaleY);
                    return (
                        <React.Fragment key={ratio}>
                            <G>
                                <Rect
                                    x={paddingLeft}
                                    y={y}
                                    width={chartWidth - paddingLeft - paddingRight}
                                    height={1}
                                    fill="#333"
                                />
                                <SvgText x={0} y={y + 4} fill="#666" fontSize="10" textAnchor="start">
                                    {Math.round(maxValue * ratio)}m
                                </SvgText>
                            </G>
                        </React.Fragment>
                    );
                })}

                {/* Bars */}
                {data.map((item, index) => {
                    const groupX = paddingLeft + (index * groupWidth);
                    const centerX = groupX + (groupWidth / 2);

                    // Bars
                    const spentH = item.spent * scaleY;
                    const allocatedH = item.allocated * scaleY;

                    const spentX = centerX - barWidth - (spacing / 2);
                    const allocatedX = centerX + (spacing / 2);

                    const spentY = chartHeight - paddingBottom - spentH;
                    const allocatedY = chartHeight - paddingBottom - allocatedH;

                    return (
                        <G key={index}>
                            {/* Spent Bar */}
                            <Rect
                                x={spentX}
                                y={spentY}
                                width={barWidth}
                                height={spentH}
                                fill="#35c128"
                                rx={2}
                            />
                            {/* Value Label (only if space permits?) - Requested by user */}
                            {item.spent > 0 && (
                                <SvgText
                                    x={spentX + barWidth / 2}
                                    y={spentY - 5}
                                    fill="#35c128"
                                    fontSize="9"
                                    textAnchor="middle"
                                >
                                    {Math.round(item.spent)}
                                </SvgText>
                            )}

                            {/* Allocated Bar */}
                            <Rect
                                x={allocatedX}
                                y={allocatedY}
                                width={barWidth}
                                height={allocatedH}
                                fill="#2196F3"
                                rx={2}
                            />
                            {item.allocated > 0 && (
                                <SvgText
                                    x={allocatedX + barWidth / 2}
                                    y={allocatedY - 5}
                                    fill="#2196F3"
                                    fontSize="9"
                                    textAnchor="middle"
                                >
                                    {Math.round(item.allocated)}
                                </SvgText>
                            )}

                            {/* X-Axis Label */}
                            <SvgText
                                x={centerX}
                                y={chartHeight - 10}
                                fill="#aaa"
                                fontSize="10"
                                textAnchor="middle"
                            >
                                {item.day}
                            </SvgText>
                        </G>
                    );
                })}


            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1e1e1e',
        borderRadius: 16,
        padding: 15,
        marginBottom: 20
    },
    heading: {
        marginBottom: 10,
        flexDirection: 'row',
        justifyContent: 'flex-end'
    },
    legend: {
        flexDirection: 'row',
        gap: 15
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4
    },
    legendText: {
        color: '#aaa',
        fontSize: 12
    }
});
