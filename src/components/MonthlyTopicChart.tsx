import React from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, Rect } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface DataPoint {
    day: number; // 1-31
    value: number; // topics count
}

interface MonthlyTopicChartProps {
    data: DataPoint[];
    currentMonth: Date;
    onMonthChange: (direction: -1 | 1) => void;
}

export default function MonthlyTopicChart({ data, currentMonth, onMonthChange }: MonthlyTopicChartProps) {
    const screenWidth = Dimensions.get('window').width;
    const chartWidth = screenWidth - 40; // Full width minus padding
    const chartHeight = 220;
    const paddingBottom = 40;
    const paddingLeft = 30;
    const paddingRight = 20;

    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();

    // Max value for Y-axis scale
    const maxValue = Math.max(...data.map(d => d.value), 5); // Minimum scale of 5
    const scaleY = (chartHeight - paddingBottom - 20) / maxValue;
    const stepX = (chartWidth - paddingLeft - paddingRight) / (daysInMonth - 1);

    // Generate Path for Line Chart
    // Sort data just in case
    const sortedData = [...data].sort((a, b) => a.day - b.day);

    // Map day 1..31 to x coordinates
    // We want to show a point for every day even if 0? Or just connect existing points?
    // For "Topics Covered", 0 is meaningful. So we should probably assume 0 for missing days.

    let pathD = "";

    // We construct a full array for 1..daysInMonth
    const fullData: number[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
        const found = data.find(d => d.day === i);
        fullData.push(found ? found.value : 0);
    }

    fullData.forEach((val, index) => {
        const day = index + 1;
        const x = paddingLeft + ((day - 1) * stepX);
        const y = chartHeight - paddingBottom - (val * scaleY);

        if (index === 0) {
            pathD += `M ${x} ${y}`;
        } else {
            pathD += ` L ${x} ${y}`;
        }
    });

    const isCurrentMonth = currentMonth.getFullYear() === new Date().getFullYear() && currentMonth.getMonth() === new Date().getMonth();

    return (
        <View style={styles.container}>
            {/* Header with Month Navigation */}
            <View style={styles.header}>
                <View style={{ flex: 1 }} />
                <View style={styles.controls}>
                    <TouchableOpacity onPress={() => onMonthChange(-1)} style={styles.navBtn}>
                        <MaterialCommunityIcons name="chevron-left" size={24} color="#aaa" />
                    </TouchableOpacity>
                    <Text style={[styles.monthLabel, isCurrentMonth && { color: '#35c128' }]}>{monthLabel}</Text>
                    <TouchableOpacity onPress={() => onMonthChange(1)} style={styles.navBtn}>
                        <MaterialCommunityIcons name="chevron-right" size={24} color="#aaa" />
                    </TouchableOpacity>
                </View>
            </View>

            <Svg width={chartWidth} height={chartHeight}>
                {/* Horizontal Grid Lines (0, 50%, 100%) */}
                {[0, 0.5, 1].map((ratio) => {
                    const y = chartHeight - paddingBottom - (maxValue * ratio * scaleY);
                    return (
                        <React.Fragment key={ratio}>
                            <Line x1={paddingLeft} y1={y} x2={chartWidth - paddingRight} y2={y} stroke="#333" strokeDasharray="4 2" strokeWidth="1" />
                            <SvgText x={0} y={y + 4} fill="#666" fontSize="10" textAnchor="start">
                                {Math.round(maxValue * ratio)}
                            </SvgText>
                        </React.Fragment>
                    );
                })}

                {/* Bars */}
                {fullData.map((val, i) => {
                    const day = i + 1;
                    const barWidth = 6;
                    // Center the bar on the tick
                    const x = paddingLeft + ((day - 1) * stepX) - (barWidth / 2);
                    const barHeight = val * scaleY;
                    const y = chartHeight - paddingBottom - barHeight;

                    // Clickable area could be added here if needed
                    return (
                        <React.Fragment key={day}>
                            {/* Bar background for hit area? Optional */}

                            {/* The Bar */}
                            <Rect
                                x={x}
                                y={y}
                                width={barWidth}
                                height={barHeight}
                                fill={val > 0 ? "#35c128" : "transparent"}
                                rx={2} // Rounded corners
                            />

                            {/* Value Label */}
                            {val > 0 && (
                                <SvgText
                                    x={x + barWidth / 2}
                                    y={y - 5}
                                    fill="white"
                                    fontSize="9"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                >
                                    {val}
                                </SvgText>
                            )}
                        </React.Fragment>
                    );
                })}

                {/* X-Axis Labels (Every 5 days) */}
                {Array.from({ length: Math.ceil(daysInMonth / 5) }, (_, i) => i * 5 + 1).map(day => {
                    if (day > daysInMonth) return null;
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
        marginBottom: 20
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white'
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#252525',
        borderRadius: 20,
        paddingHorizontal: 5
    },
    navBtn: {
        padding: 5
    },
    monthLabel: {
        color: 'white',
        fontWeight: '600',
        minWidth: 100,
        textAlign: 'center',
        fontSize: 14
    }
});
