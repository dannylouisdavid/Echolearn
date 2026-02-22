import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, G, Text as SvgText } from 'react-native-svg';

interface CompletionRecordChartProps {
    data: {
        tooFast: number;
        onTime: number;
        overtime: number;
    }
}

export default function CompletionRecordChart({ data }: CompletionRecordChartProps) {
    const screenWidth = Dimensions.get('window').width;
    const size = 180;
    const strokeWidth = 20;
    const center = size / 2;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const total = data.tooFast + data.onTime + data.overtime;

    // Only show if there's data
    if (total === 0) {
        return (
            <View style={styles.container}>
                <Text style={styles.noData}>No completion data available</Text>
            </View>
        );
    }

    const sections = [
        { key: 'onTime', value: data.onTime, color: '#35c128', label: 'On Time' },
        { key: 'tooFast', value: data.tooFast, color: '#FFC107', label: 'Too Fast' }, // Amber/Yellow
        { key: 'overtime', value: data.overtime, color: '#FF5252', label: 'Overtime' }  // Red
    ];

    let startAngle = 0;

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <G rotation="-90" origin={`${center}, ${center}`}>
                        {sections.map((section, index) => {
                            if (section.value === 0) return null;

                            const percentage = section.value / total;
                            const strokeDasharray = `${circumference * percentage} ${circumference}`;
                            const rotate = startAngle * 360;

                            startAngle += percentage;

                            return (
                                <Circle
                                    key={section.key}
                                    cx={center}
                                    cy={center}
                                    r={radius}
                                    stroke={section.color}
                                    strokeWidth={strokeWidth}
                                    fill="transparent"
                                    strokeDasharray={strokeDasharray}
                                    strokeDashoffset={0}
                                    rotation={rotate}
                                    origin={`${center}, ${center}`}
                                />
                            );
                        })}
                    </G>

                    {/* Center Text */}
                    <SvgText
                        x={center}
                        y={center - 5}
                        textAnchor="middle"
                        fontSize="24"
                        fontWeight="bold"
                        fill="white"
                    >
                        {total}
                    </SvgText>
                    <SvgText
                        x={center}
                        y={center + 15}
                        textAnchor="middle"
                        fontSize="12"
                        fill="#aaa"
                    >
                        Topics
                    </SvgText>
                </Svg>

                <View style={styles.legendContainer}>
                    {sections.map(section => (
                        <View key={section.key} style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: section.color }]} />
                            <Text style={styles.legendText}>
                                {section.label} ({section.value})
                            </Text>
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
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around'
    },
    noData: {
        color: '#aaa',
        fontStyle: 'italic',
        textAlign: 'center',
        marginVertical: 20
    },
    legendContainer: {
        justifyContent: 'center',
        gap: 12
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5
    },
    legendText: {
        color: '#ccc',
        fontSize: 14
    }
});
