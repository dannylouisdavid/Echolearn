import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg from 'react-native-svg';
import { ArrowConnector } from '../../components/canvas/ArrowConnector';
import { Arrow, AnchorPosition } from '../../types/schema';

// Mock nodes for testing
const NODE_A = { x: 50, y: 150, width: 120, height: 80 };
const NODE_B = { x: 250, y: 150, width: 120, height: 80 };
const NODE_C = { x: 150, y: 320, width: 120, height: 80 };

export default function ArrowTestPage() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Arrow style state
    const [lineType, setLineType] = useState<'straight' | 'curved'>('straight');
    const [arrowEnds, setArrowEnds] = useState<'none' | 'end' | 'both'>('end');
    const [lineStyle, setLineStyle] = useState<'solid' | 'dotted'>('solid');
    const [sourceAnchor, setSourceAnchor] = useState<AnchorPosition>('right');
    const [targetAnchor, setTargetAnchor] = useState<AnchorPosition>('left');

    // Create test arrow based on current settings
    const testArrow: Arrow = {
        id: 'test-1',
        sourceNodeId: 'node-a',
        targetNodeId: 'node-b',
        sourceAnchor,
        targetAnchor,
        lineType,
        arrowEnds,
        lineStyle,
        label: 'Test Arrow',
        color: '#333'
    };

    // Create additional demo arrows
    const demoArrows: Arrow[] = [
        {
            id: 'demo-1',
            sourceNodeId: 'node-a',
            targetNodeId: 'node-c',
            sourceAnchor: 'bottom',
            targetAnchor: 'top-left',
            lineType: 'curved',
            arrowEnds: 'end',
            lineStyle: 'solid',
            color: '#2196F3'
        },
        {
            id: 'demo-2',
            sourceNodeId: 'node-b',
            targetNodeId: 'node-c',
            sourceAnchor: 'bottom',
            targetAnchor: 'top-right',
            lineType: 'straight',
            arrowEnds: 'both',
            lineStyle: 'dotted',
            color: '#4CAF50'
        }
    ];

    const anchors: AnchorPosition[] = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>Arrow Connector Test</Text>
            </View>

            {/* Canvas Area */}
            <View style={styles.canvas}>
                <Svg width="100%" height={300}>
                    {/* Render configurable test arrow */}
                    <ArrowConnector
                        arrow={testArrow}
                        sourceNode={NODE_A}
                        targetNode={NODE_B}
                        scale={1}
                        isSelected={true}
                    />

                    {/* Render demo arrows */}
                    {demoArrows.map(arrow => (
                        <ArrowConnector
                            key={arrow.id}
                            arrow={arrow}
                            sourceNode={arrow.sourceNodeId === 'node-a' ? NODE_A : NODE_B}
                            targetNode={NODE_C}
                            scale={1}
                        />
                    ))}
                </Svg>

                {/* Node A */}
                <View style={[styles.node, { left: NODE_A.x, top: NODE_A.y - 100, width: NODE_A.width, height: NODE_A.height, backgroundColor: '#FFECB3' }]}>
                    <Text style={styles.nodeText}>Node A</Text>
                </View>

                {/* Node B */}
                <View style={[styles.node, { left: NODE_B.x, top: NODE_B.y - 100, width: NODE_B.width, height: NODE_B.height, backgroundColor: '#B3E5FC' }]}>
                    <Text style={styles.nodeText}>Node B</Text>
                </View>

                {/* Node C */}
                <View style={[styles.node, { left: NODE_C.x, top: NODE_C.y - 100, width: NODE_C.width, height: NODE_C.height, backgroundColor: '#C8E6C9' }]}>
                    <Text style={styles.nodeText}>Node C</Text>
                </View>
            </View>

            {/* Controls */}
            <ScrollView style={styles.controls}>
                {/* Line Type */}
                <Text style={styles.sectionTitle}>Line Type</Text>
                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.optionBtn, lineType === 'straight' && styles.optionBtnActive]}
                        onPress={() => setLineType('straight')}
                    >
                        <Text style={lineType === 'straight' ? styles.optionTextActive : styles.optionText}>Straight</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.optionBtn, lineType === 'curved' && styles.optionBtnActive]}
                        onPress={() => setLineType('curved')}
                    >
                        <Text style={lineType === 'curved' ? styles.optionTextActive : styles.optionText}>Curved</Text>
                    </TouchableOpacity>
                </View>

                {/* Arrow Ends */}
                <Text style={styles.sectionTitle}>Arrow Ends</Text>
                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.optionBtn, arrowEnds === 'none' && styles.optionBtnActive]}
                        onPress={() => setArrowEnds('none')}
                    >
                        <Text style={arrowEnds === 'none' ? styles.optionTextActive : styles.optionText}>None</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.optionBtn, arrowEnds === 'end' && styles.optionBtnActive]}
                        onPress={() => setArrowEnds('end')}
                    >
                        <Text style={arrowEnds === 'end' ? styles.optionTextActive : styles.optionText}>One End</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.optionBtn, arrowEnds === 'both' && styles.optionBtnActive]}
                        onPress={() => setArrowEnds('both')}
                    >
                        <Text style={arrowEnds === 'both' ? styles.optionTextActive : styles.optionText}>Both</Text>
                    </TouchableOpacity>
                </View>

                {/* Line Style */}
                <Text style={styles.sectionTitle}>Line Style</Text>
                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.optionBtn, lineStyle === 'solid' && styles.optionBtnActive]}
                        onPress={() => setLineStyle('solid')}
                    >
                        <Text style={lineStyle === 'solid' ? styles.optionTextActive : styles.optionText}>Solid</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.optionBtn, lineStyle === 'dotted' && styles.optionBtnActive]}
                        onPress={() => setLineStyle('dotted')}
                    >
                        <Text style={lineStyle === 'dotted' ? styles.optionTextActive : styles.optionText}>Dotted</Text>
                    </TouchableOpacity>
                </View>

                {/* Source Anchor */}
                <Text style={styles.sectionTitle}>Source Anchor (Node A)</Text>
                <View style={styles.anchorGrid}>
                    {anchors.map(a => (
                        <TouchableOpacity
                            key={`src-${a}`}
                            style={[styles.anchorBtn, sourceAnchor === a && styles.anchorBtnActive]}
                            onPress={() => setSourceAnchor(a)}
                        >
                            <Text style={styles.anchorText}>{a}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Target Anchor */}
                <Text style={styles.sectionTitle}>Target Anchor (Node B)</Text>
                <View style={styles.anchorGrid}>
                    {anchors.map(a => (
                        <TouchableOpacity
                            key={`tgt-${a}`}
                            style={[styles.anchorBtn, targetAnchor === a && styles.anchorBtnActive]}
                            onPress={() => setTargetAnchor(a)}
                        >
                            <Text style={styles.anchorText}>{a}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5'
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 10,
        gap: 12
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold'
    },
    canvas: {
        height: 300,
        backgroundColor: 'white',
        marginHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#ddd',
        position: 'relative',
        overflow: 'hidden'
    },
    node: {
        position: 'absolute',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#333',
        justifyContent: 'center',
        alignItems: 'center'
    },
    nodeText: {
        fontWeight: 'bold',
        fontSize: 14
    },
    controls: {
        flex: 1,
        padding: 16
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        marginTop: 12,
        marginBottom: 8,
        color: '#666'
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap'
    },
    optionBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#eee',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd'
    },
    optionBtnActive: {
        backgroundColor: '#2196F3',
        borderColor: '#1976D2'
    },
    optionText: {
        color: '#333'
    },
    optionTextActive: {
        color: 'white',
        fontWeight: 'bold'
    },
    anchorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6
    },
    anchorBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#eee',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#ddd'
    },
    anchorBtnActive: {
        backgroundColor: '#4CAF50',
        borderColor: '#388E3C'
    },
    anchorText: {
        fontSize: 11,
        color: '#333'
    }
});
