import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

interface ComparisonBarChartProps {
    spent: number; // minutes
    allocated: number; // minutes
    label: string; // e.g. "Today" or "December"
}

export default function ComparisonBarChart({ spent, allocated, label }: ComparisonBarChartProps) {
    const screenWidth = Dimensions.get('window').width;
    const chartWidth = screenWidth - 80;
    const chartHeight = 150;
    const barWidth = 60;
    const spacing = 40;
    const maxVal = Math.max(spent, allocated, 60); // Min scale 60 mins

    const scaleY = (val: number) => (val / maxVal) * (chartHeight - 40);

    const spentHeight = scaleY(spent);
    const allocatedHeight = scaleY(allocated);

    const centerX = chartWidth / 2;
    const spentX = centerX - barWidth - (spacing / 2);
    const allocatedX = centerX + (spacing / 2);

    return (
        <View style={styles.container}>
            <Svg width={chartWidth} height={chartHeight}>
                {/* Allocated Bar */}
                <Rect
                    x={allocatedX}
                    y={chartHeight - allocatedHeight - 20}
                    width={barWidth}
                    height={allocatedHeight}
                    fill="#2196F3"
                    rx={4}
                />
                <SvgText
                    x={allocatedX + barWidth / 2}
                    y={chartHeight - allocatedHeight - 25}
                    fontSize="12"
                    fill="#aaa"
                    textAnchor="middle"
                >
                    {Math.round(allocated)}m
                </SvgText>
                <SvgText
                    x={allocatedX + barWidth / 2}
                    y={chartHeight - 5}
                    fontSize="12"
                    fill="white"
                    textAnchor="middle"
                >
                    Allocated
                </SvgText>

                {/* Spent Bar */}
                <Rect
                    x={spentX}
                    y={chartHeight - spentHeight - 20}
                    width={barWidth}
                    height={spentHeight}
                    fill={spent > allocated ? "#35c128" : "#FFC107"} // Green if more, Yellow if less? Or Color by type? Let's stick to standard colors.
                    // Actually, let's make Spent Green to match brand.
                    fillOpacity={1}
                />
                {/* Re-render Spent with specific color logic if needed, but let's use Brand Green for Spent */}
                <Rect
                    x={spentX}
                    y={chartHeight - spentHeight - 20}
                    width={barWidth}
                    height={spentHeight}
                    fill="#35c128"
                    rx={4}
                />

                <SvgText
                    x={spentX + barWidth / 2}
                    y={chartHeight - spentHeight - 25}
                    fontSize="12"
                    fill="#aaa"
                    textAnchor="middle"
                >
                    {Math.round(spent)}m
                </SvgText>
                <SvgText
                    x={spentX + barWidth / 2}
                    y={chartHeight - 5}
                    fontSize="12"
                    fill="white"
                    textAnchor="middle"
                >
                    Spent
                </SvgText>
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1e1e1e',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        alignItems: 'center'
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 20,
        alignSelf: 'flex-start'
    }
});
