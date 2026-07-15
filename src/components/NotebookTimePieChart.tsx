import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, G, Circle } from 'react-native-svg';

interface DataPoint {
    name: string;
    value: number; // minutes
    color: string;
}

interface NotebookTimePieChartProps {
    data: DataPoint[];
}

export default function NotebookTimePieChart({ data }: NotebookTimePieChartProps) {
    // const screenWidth = Dimensions.get('window').width;
    const size = 225; // Reduced by 25% from 300 as requested
    const center = size / 2;
    // To make a filled pie using stroke:
    // radius must be half of the full radius (center of the stroke)
    // strokeWidth must be the full diameter (size) effectively, or just radius*2?
    // Actually simpler: radius = size / 4. strokeWidth = size / 2.
    // Wait, stroke grows outwards and inwards.
    // If r=size/4 (75), strokeWidth=size/2 (150).
    // Inner edge = 75 - 75 = 0. Outer edge = 75 + 75 = 150 (which is center + radius).
    // So yes, to fill 0 to 150 radius, we use r=75, strokeWidth=150.
    const radius = size / 4;
    const strokeWidth = size / 2;
    const circumference = 2 * Math.PI * radius;

    const total = data.reduce((acc, cur) => acc + cur.value, 0);

    if (total === 0) {
        return (
            <View style={styles.container}>
                <View style={[styles.chartContainer, { height: size, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: '#666' }}>No time recorded yet.</Text>
                </View>
            </View>
        );
    }

    let currentOffset = 0; // This will track the cumulative offset for each segment

    return (
        <View style={styles.container}>
            <View style={styles.row}>
                <View style={styles.chartContainer}>
                    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                        <G rotation="-90" origin={`${center}, ${center}`}>
                            {data.map((item, index) => {
                                const percentage = item.value / total;
                                const dashLength = circumference * percentage;
                                const strokeDasharray = `${dashLength} ${circumference - dashLength}`; // Dash length, then gap length

                                // The strokeDashoffset needs to be negative to start the dash at the correct position
                                // and accumulate for each segment.
                                const offset = -currentOffset;
                                currentOffset += dashLength;

                                return (
                                    <Circle
                                        key={index}
                                        cx={center}
                                        cy={center}
                                        r={radius}
                                        stroke={item.color}
                                        strokeWidth={strokeWidth}
                                        fill="transparent"
                                        strokeDasharray={strokeDasharray}
                                        strokeDashoffset={offset}
                                    />
                                );
                            })}
                        </G>
                        {/* Center Hole? No, user wants Pie. This method creates a full pie. */}
                    </Svg>
                </View>

                <View style={styles.legend}>
                    {data.map((item, index) => (
                        <View key={index} style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: item.color }]} />
                            <View>
                                <Text style={styles.legendText} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.legendSub}>{Math.round(item.value)} mins ({Math.round((item.value / total) * 100)}%)</Text>
                            </View>
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1e1e1e',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 20
    },
    row: {
        flexDirection: 'column', // Changed to column for better vertical space with large chart
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20
    },
    chartContainer: {
        // marginRight: 20
        alignItems: 'center',
        justifyContent: 'center',
    },
    legend: {
        width: '100%',
        paddingLeft: 10,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 15
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 10
    },
    legendText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600'
    },
    legendSub: {
        color: '#aaa',
        fontSize: 12
    }
});
