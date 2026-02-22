import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';

interface TrendDataPoint {
    day: number;
    spent: number;
    allocated: number;
}

interface MonthlyTimeTrendChartProps {
    data: TrendDataPoint[];
    monthLabel: string;
}

export default function MonthlyTimeTrendChart({ data, monthLabel }: MonthlyTimeTrendChartProps) {
    const screenWidth = Dimensions.get('window').width;
    const chartWidth = screenWidth - 40;
    const chartHeight = 220;
    const paddingBottom = 40;
    const paddingLeft = 30;
    const paddingRight = 20;
    const paddingTop = 20;

    // Determine max value for Y-axis scale
    const allValues = data.flatMap(d => [d.spent, d.allocated]);
    const maxValue = Math.max(...allValues, 60); // Minimum scale of 60 mins
    const scaleY = (chartHeight - paddingBottom - paddingTop) / maxValue;

    // X-axis step
    // Assume data covers 1..daysInMonth, or at least we map to that.
    // Let's assume input data is sorted and dense or we map by day index.
    // Ideally we should know days in month. Let's just use data.length or max day.
    const maxDay = data.length > 0 ? Math.max(...data.map(d => d.day)) : 30;
    const daysCount = Math.max(maxDay, 30); // Default to at least 30 scale
    const stepX = (chartWidth - paddingLeft - paddingRight) / (daysCount > 1 ? daysCount - 1 : 1);

    const getPath = (key: 'spent' | 'allocated') => {
        let path = "";
        data.forEach((point, index) => {
            // Find correct x for day
            // If data is sparse, we must use point.day. 
            // We assume point.day is 1-based index.
            const dayIndex = point.day - 1;
            const x = paddingLeft + (dayIndex * stepX);
            const val = key === 'spent' ? point.spent : point.allocated;
            const y = chartHeight - paddingBottom - (val * scaleY);

            if (index === 0) {
                path += `M ${x} ${y}`;
            } else {
                path += ` L ${x} ${y}`;
            }
        });
        return path;
    };

    const spentPath = getPath('spent');
    const allocatedPath = getPath('allocated');

    return (
        <View style={styles.container}>
            <View style={styles.header}>
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
                {/* Horizontal Grid */}
                {[0, 0.5, 1].map((ratio) => {
                    const y = chartHeight - paddingBottom - (maxValue * ratio * scaleY);
                    return (
                        <React.Fragment key={ratio}>
                            <Line
                                x1={paddingLeft}
                                y1={y}
                                x2={chartWidth - paddingRight}
                                y2={y}
                                stroke="#333"
                                strokeDasharray="4 2"
                                strokeWidth="1"
                            />
                            <SvgText x={0} y={y + 4} fill="#666" fontSize="10" textAnchor="start">
                                {Math.round(maxValue * ratio)}m
                            </SvgText>
                        </React.Fragment>
                    );
                })}

                {/* Allocated Line (Blue) */}
                <Path d={allocatedPath} stroke="#2196F3" strokeWidth="2" fill="none" />

                {/* Spent Line (Green) */}
                <Path d={spentPath} stroke="#35c128" strokeWidth="2" fill="none" />

                {/* X-Axis Labels (Every 5 days) */}
                {Array.from({ length: Math.ceil(daysCount / 5) }, (_, i) => i * 5 + 1).map(day => {
                    if (day > daysCount) return null;
                    const x = paddingLeft + ((day - 1) * stepX);
                    return (
                        <SvgText key={day} x={x} y={chartHeight - 10} fill="#666" fontSize="10" textAnchor="middle">
                            {day}
                        </SvgText>
                    )
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white'
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
