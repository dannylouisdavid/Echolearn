import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { AnchorPosition } from '../../types/schema';

interface AnchorPointsProps {
    nodeWidth: number;
    nodeHeight: number;
    scale: number;
    visible: boolean;
    onAnchorSelect: (anchor: AnchorPosition) => void;
    highlightedAnchor?: AnchorPosition;
}

const ANCHOR_POSITIONS: AnchorPosition[] = [
    'top-left',
    'top',
    'top-right',
    'left',
    'right',
    'bottom-left',
    'bottom',
    'bottom-right',
];

interface SingleAnchorProps {
    anchor: AnchorPosition;
    style: { left: number; top: number };
    size: number;
    isHighlighted: boolean;
    onSelect: (anchor: AnchorPosition) => void;
}

const SingleAnchor: React.FC<SingleAnchorProps> = React.memo(({ anchor, style, size, isHighlighted, onSelect }) => {
    const handleTap = useCallback(() => {
        onSelect(anchor);
    }, [anchor, onSelect]);

    const tapGesture = React.useMemo(() =>
        Gesture.Tap()
            .maxDuration(200) // Faster recognition
            .runOnJS(true) // Run directly on JS thread for faster response
            .onEnd(() => {
                handleTap();
            }),
        [handleTap]
    );

    return (
        <GestureDetector gesture={tapGesture}>
            <Animated.View
                style={[
                    styles.anchor,
                    {
                        left: style.left,
                        top: style.top,
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor: isHighlighted ? '#4CAF50' : '#2196F3'
                    }
                ]}
            />
        </GestureDetector>
    );
});

export const AnchorPoints: React.FC<AnchorPointsProps> = ({
    nodeWidth,
    nodeHeight,
    scale,
    visible,
    onAnchorSelect,
    highlightedAnchor
}) => {
    if (!visible || !nodeWidth || !nodeHeight) return null;

    const anchorSize = Math.min(25, Math.max(10, 10 / scale));
    const radius = anchorSize / 2;

    const getAnchorStyle = (pos: AnchorPosition): { left: number; top: number } => {
        let left = 0;
        let top = 0;

        // Horizontal Positioning
        if (pos.includes('left')) {
            left = -radius;
        } else if (pos.includes('right')) {
            left = nodeWidth - radius;
        } else {
            // center (top/bottom)
            left = (nodeWidth / 2) - radius;
        }

        // Vertical Positioning
        if (pos.includes('top')) {
            top = -radius;
        } else if (pos.includes('bottom')) {
            top = nodeHeight - radius;
        } else {
            // center (left/right)
            top = (nodeHeight / 2) - radius;
        }

        return { left, top };
    };

    return (
        <>
            {ANCHOR_POSITIONS.map((anchor) => (
                <SingleAnchor
                    key={anchor}
                    anchor={anchor}
                    style={getAnchorStyle(anchor)}
                    size={anchorSize}
                    isHighlighted={highlightedAnchor === anchor}
                    onSelect={onAnchorSelect}
                />
            ))}
        </>
    );
};

const styles = StyleSheet.create({
    anchor: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: 'white',
        elevation: 10,
        shadowColor: 'transparent',
        zIndex: 1000
    }
});

export default AnchorPoints;
