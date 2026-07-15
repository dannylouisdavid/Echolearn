import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Polygon, Line, Text as SvgText, G } from 'react-native-svg';
import { Arrow, AnchorPosition } from '../../types/schema';

interface NodePosition {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ArrowConnectorProps {
    arrow: Arrow;
    sourceNode: NodePosition;
    targetNode: NodePosition;
    scale: number;
    isSelected?: boolean;
    onSelect?: () => void;
}

// Helper to calculate anchor point coordinates
export const getAnchorPoint = (node: NodePosition, anchor: AnchorPosition): { x: number; y: number } => {
    const { x, y, width, height } = node;

    switch (anchor) {
        case 'top-left': return { x: x, y: y };
        case 'top': return { x: x + width / 2, y: y };
        case 'top-right': return { x: x + width, y: y };
        case 'left': return { x: x, y: y + height / 2 };
        case 'right': return { x: x + width, y: y + height / 2 };
        case 'bottom-left': return { x: x, y: y + height };
        case 'bottom': return { x: x + width / 2, y: y + height };
        case 'bottom-right': return { x: x + width, y: y + height };
        default: return { x: x + width / 2, y: y + height / 2 };
    }
};

// Helper to calculate arrowhead points
const getArrowHead = (
    x1: number, y1: number,
    x2: number, y2: number,
    size: number = 10
): string => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const a1 = angle + Math.PI * 0.85;
    const a2 = angle - Math.PI * 0.85;
    const p1x = x2 + Math.cos(a1) * size;
    const p1y = y2 + Math.sin(a1) * size;
    const p2x = x2 + Math.cos(a2) * size;
    const p2y = y2 + Math.sin(a2) * size;
    return `${p1x},${p1y} ${x2},${y2} ${p2x},${p2y}`;
};

// Helper to calculate bezier control point for curved lines
export const getCurveControlPoint = (
    source: { x: number; y: number },
    target: { x: number; y: number }
): { x: number; y: number } => {
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;

    // Calculate perpendicular offset based on direction
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Curve amount proportional to distance
    const curveOffset = Math.min(distance * 0.2, 50);

    // Perpendicular direction
    const perpX = -dy / distance;
    const perpY = dx / distance;

    return {
        x: midX + perpX * curveOffset,
        y: midY + perpY * curveOffset
    };
};

export const ArrowConnector: React.FC<ArrowConnectorProps> = ({
    arrow,
    sourceNode,
    targetNode,
    scale,
    isSelected,
    onSelect
}) => {
    const source = getAnchorPoint(sourceNode, arrow.sourceAnchor);
    const target = getAnchorPoint(targetNode, arrow.targetAnchor);

    const strokeWidth = (isSelected ? 3 : 2) / scale;
    const arrowSize = 12 / scale;
    const color = arrow.color || '#333';

    const strokeDasharray = arrow.lineStyle === 'dotted' ? `${5 / scale},${5 / scale}` : undefined;

    // Build path based on line type
    let pathD: string;
    let endPoint = target;
    let startPoint = source;

    if (arrow.lineType === 'curved') {
        const control = getCurveControlPoint(source, target);
        pathD = `M ${source.x} ${source.y} Q ${control.x} ${control.y} ${target.x} ${target.y}`;

        // For curved arrows, calculate the tangent at end point for arrowhead
        // Derivative of quadratic bezier at t=1 is: 2*(P2-P1) where P1=control, P2=target
        // So the direction at end is from control to target
        startPoint = control; // For arrowhead calculation at start
        endPoint = target;
    } else {
        pathD = `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
    }

    // Calculate midpoint for label
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;

    // For curved line, adjust midpoint to be on the curve
    const labelPos = arrow.lineType === 'curved'
        ? getCurveControlPoint(source, target)
        : { x: midX, y: midY };

    return (
        <React.Fragment>
            <G>
                {/* Invisible thick line for easier tap/selection */}
                {/* Invisible thick line for easier tap/selection */}
                <Path
                    d={pathD}
                    stroke="rgba(0,0,0,0.001)"
                    strokeWidth={40 / scale}
                    fill="none"
                />

                {/* Visible arrow line */}
                <Path
                    d={pathD}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    fill="none"
                    strokeLinecap="round"
                />

                {/* Start arrowhead (if both ends have arrows) */}
                {arrow.arrowEnds === 'both' && (
                    <Polygon
                        points={getArrowHead(target.x, target.y, source.x, source.y, arrowSize)}
                        fill={color}
                    />
                )}

                {/* End arrowhead (if end or both) */}
                {(arrow.arrowEnds === 'end' || arrow.arrowEnds === 'both') && (
                    <Polygon
                        points={getArrowHead(
                            arrow.lineType === 'curved'
                                ? getCurveControlPoint(source, target).x
                                : source.x,
                            arrow.lineType === 'curved'
                                ? getCurveControlPoint(source, target).y
                                : source.y,
                            target.x,
                            target.y,
                            arrowSize
                        )}
                        fill={color}
                    />
                )}

                {/* Label */}
                {arrow.label && (
                    <SvgText
                        x={labelPos.x}
                        y={labelPos.y - 5 / scale}
                        fontSize={12 / scale}
                        fill="#333"
                        textAnchor="middle"
                    >
                        {arrow.label}
                    </SvgText>
                )}

                {/* Selection indicator - REMOVED per user feedback */}
                {/* {isSelected && (
                    <>
                        <Circle cx={source.x} cy={source.y} r={6 / scale} fill="#4CAF50" />
                        <Circle cx={target.x} cy={target.y} r={6 / scale} fill="#4CAF50" />
                    </>
                )} */}
            </G>
        </React.Fragment>
    );
};

export default ArrowConnector;
