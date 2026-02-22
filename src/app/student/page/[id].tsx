import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity as RNTouchableOpacity, Modal, Alert, TextInput, ScrollView, BackHandler, StatusBar, Platform, Pressable, Keyboard, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useNavigation } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore'; // Added deleteField



import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../services/auth/AuthContext';
import { useFocusAudio } from '../../../services/audio/useFocusAudio';
import { calculateNextReview, INITIAL_SM18_STATE } from '../../../services/sm18/algorithm';
import { scheduleReviewNotification } from '../../../services/notifications';
import { Page, Arrow, AnchorPosition } from '../../../types/schema';
import Svg, { Path, Circle, Rect, Line, Polygon, G } from 'react-native-svg';
import { AnalyticsModal } from '../../../components/AnalyticsModal';
import CommentsModal from '../../../components/CommentsModal';
import { StudentProfile } from '../../../types/schema';
import { Gesture, GestureDetector, TouchableOpacity } from 'react-native-gesture-handler';
import { CustomAlert } from '../../../components/CustomAlert';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS, withSpring, withDelay, useAnimatedProps, SharedValue } from 'react-native-reanimated';
import { RichTextNode, RichTextBlock } from '../../../components/canvas/RichTextNode';
import { ArrowConnector, getAnchorPoint, getCurveControlPoint } from '../../../components/canvas/ArrowConnector';
import { ArrowToolbar } from '../../../components/canvas/ArrowToolbar';
import { AnchorPoints } from '../../../components/canvas/AnchorPoints';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedSvg = Animated.createAnimatedComponent(Svg);
const AnimatedG = Animated.createAnimatedComponent(G);

type Tool = 'pen' | 'eraser' | 'text' | 'shape' | 'drag' | 'arrow';
type ShapeType = 'rect' | 'circle' | 'triangle' | 'line' | 'dotted-line' | 'arrow' | 'dotted-arrow';

interface CanvasElement {
    id: string;
    type: 'path' | 'text' | 'shape';
    color: string;
    strokeWidth?: number; // Added strokeWidth
    // Path specific
    d?: string;
    // Text specific
    text?: string;
    x?: number;
    y?: number;
    // Shape specific
    shapeType?: ShapeType;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    blocks?: RichTextBlock[];
    isNew?: boolean; // To trigger auto-focus
    backgroundColor?: string;
    width?: number; // Added dynamic width
    height?: number; // Added dynamic height
}


import { Dimensions } from 'react-native';

const SCREEN = Dimensions.get('window');
// DYNAMIC PAGINATION CONSTANTS
const PAGE_WIDTH = SCREEN.width;
const PAGE_HEIGHT = SCREEN.height;
// Initial: Center Page (0,0 to W,H) + 1 Page Buffer on all sides
// Bounds: Left (-W), Top (-H), Right (2W), Bottom (2H) => Total 3x3 Grid area covering center.
const INITIAL_BOUNDS = {
    minX: -PAGE_WIDTH,
    minY: -PAGE_HEIGHT,
    maxX: PAGE_WIDTH * 2,
    maxY: PAGE_HEIGHT * 2
};

// Helper Component to safely handle Animated Props
const CurrentDrawingPath = ({ path, color, scale }: { path: string, color: string, scale: Animated.SharedValue<number> }) => {
    const animatedProps = useAnimatedProps(() => {
        return {
            strokeWidth: 3 / scale.value
        };
    });
    return (
        <AnimatedPath d={path} stroke={color} animatedProps={animatedProps} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    );
}

// Helper Component to isolate animation hooks


// Arrow Toolbar Wrapper - positioned in CANVAS coordinates.
// Lives inside a camera-transformed view so no manual screen conversion needed.
const ArrowToolbarWrapper = ({
    selectedArrowId,
    arrows,
    elements,
    setArrows,
    setSelectedArrowId
}: {
    selectedArrowId: string,
    arrows: Arrow[],
    elements: CanvasElement[],
    setArrows: React.Dispatch<React.SetStateAction<Arrow[]>>,
    setSelectedArrowId: (id: string | null) => void
}) => {
    const arrow = arrows.find(a => a.id === selectedArrowId);
    const source = elements.find(e => e.id === arrow?.sourceNodeId);
    const target = elements.find(e => e.id === arrow?.targetNodeId);

    if (!arrow || !source || !target) return null;

    const sourceAnchor = getAnchorPoint({ x: source.x || 0, y: source.y || 0, width: source.width || 150, height: source.height || 100 }, arrow.sourceAnchor);
    const targetAnchor = getAnchorPoint({ x: target.x || 0, y: target.y || 0, width: target.width || 150, height: target.height || 100 }, arrow.targetAnchor);

    let mx = (sourceAnchor.x + targetAnchor.x) / 2;
    let my = (sourceAnchor.y + targetAnchor.y) / 2;

    if (arrow.lineType === 'curved') {
        const curvePoint = getCurveControlPoint(sourceAnchor, targetAnchor);
        mx = curvePoint.x;
        my = curvePoint.y;
    }

    return (
        <View
            style={{
                position: 'absolute',
                left: mx - 105,
                top: my - 140,
                zIndex: 999,
            }}
        >
            <ArrowToolbar
                arrow={arrow}
                scale={1}
                onUpdate={(updates) => {
                    setArrows(prev => prev.map(a => a.id === arrow.id ? { ...a, ...updates } : a));
                }}
                onDelete={() => {
                    setArrows(prev => prev.filter(a => a.id !== arrow.id));
                    setSelectedArrowId(null);
                }}
            />
        </View>
    );
};
const ActiveOverlayNode = ({
    element,
    scaleSv,
    translateX,
    translateY,
    initialScale,
    onUpdate,
    onDelete,
    onDragEnd,
    onClose,
    onColorChange
}: {
    element: CanvasElement,
    scaleSv: Animated.SharedValue<number>,
    translateX: Animated.SharedValue<number>,
    translateY: Animated.SharedValue<number>,
    initialScale: number,
    onUpdate: (blocks: RichTextBlock[]) => void,
    onDelete: () => void,
    onDragEnd: (id: string, x: number, y: number) => void,
    onClose: () => void,
    onColorChange: (color: string) => void
}) => {
    const dragX = useSharedValue(0);
    const dragY = useSharedValue(0);
    const isDragging = useSharedValue(false);

    const panGesture = Gesture.Pan()
        .minPointers(1)
        .onStart(() => {
            isDragging.value = true;
        })
        .onUpdate((e) => {
            dragX.value = e.translationX;
            dragY.value = e.translationY;
        })
        .onEnd(() => {
            isDragging.value = false;
            // Screen Delta -> Canvas Delta
            // NewCanvasX = OldCanvasX + (ScreenDelta / Scale)
            const dx = dragX.value / scaleSv.value;
            const dy = dragY.value / scaleSv.value;
            runOnJS(onDragEnd)(element.id, (element.x || 0) + dx, (element.y || 0) + dy);
        });

    const style = useAnimatedStyle(() => ({
        position: 'absolute',
        left: (element.x || 0) * scaleSv.value + translateX.value,
        top: (element.y || 0) * scaleSv.value + translateY.value,
        transform: [
            { translateX: '-50%' },
            { translateX: dragX.value },
            { translateY: dragY.value },
        ],
        // zIndex and scale removed to prevent crash
    }));

    // Reset drag when element moves (re-render)
    useEffect(() => {
        dragX.value = 0;
        dragY.value = 0;
    }, [element.x, element.y]);

    return (
        <GestureDetector gesture={panGesture}>
            <Animated.View style={style}>
                <RichTextNode
                    id={element.id}
                    initialBlocks={element.blocks}
                    color={element.color}
                    isSelected={true}
                    autoFocus={true}
                    scale={initialScale}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onClose={onClose}
                    backgroundColor={element.backgroundColor}
                    onColorChange={onColorChange}
                // pointerEvents="auto" // Default is auto, needed for input
                />
            </Animated.View>
        </GestureDetector>
    );
};

const DraggableNode = ({
    element,
    scaleSv,
    onTap,
    onDragEnd,
    children,
    onLayout
}: {
    element: CanvasElement,
    scaleSv: SharedValue<number>,
    onTap: () => void,
    onDragEnd: (id: string, x: number, y: number) => void,
    children?: React.ReactNode,
    onLayout?: (layout: { width: number; height: number, x: number, y: number }) => void
}) => {
    const dragX = useSharedValue(0);
    const dragY = useSharedValue(0);
    const isDragging = useSharedValue(false);

    const gesture = Gesture.Pan()
        .onStart(() => {
            isDragging.value = true;
        })
        .onUpdate((e) => {
            dragX.value = e.translationX / scaleSv.value;
            dragY.value = e.translationY / scaleSv.value;
        })
        .onEnd(() => {
            isDragging.value = false;
            runOnJS(onDragEnd)(element.id, (element.x || 0) + dragX.value, (element.y || 0) + dragY.value);
        });

    /*
    const tapGesture = Gesture.Tap()
        .onEnd(() => {
            runOnJS(onTap)();
        });
 
    const composed = Gesture.Race(gesture, tapGesture);
    */

    const tapGesture = Gesture.Tap()
        .maxDuration(250)
        .maxDistance(5)
        .onEnd(() => {
            runOnJS(onTap)();
        });

    const composed = Gesture.Simultaneous(gesture, tapGesture);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            // { translateX: '-50%' }, // Removed to align with top-left coordinate system
            { translateX: dragX.value },
            { translateY: dragY.value },
        ],
        opacity: isDragging.value ? 0.8 : 1,
    }));

    // Reset drag when element position changes (re-render)
    useEffect(() => {
        dragX.value = 0;
        dragY.value = 0;
    }, [element.x, element.y]);

    return (
        <GestureDetector gesture={composed}>
            <Animated.View
                collapsable={false}
                style={[
                    {
                        position: 'absolute',
                        left: element.x || 0,
                        top: element.y || 0,
                        overflow: 'visible',
                        zIndex: 10
                    },
                    animatedStyle
                ]}
                onLayout={(e) => {
                    if (onLayout) {
                        const { width, height } = e.nativeEvent.layout;
                        // Avoid loop if size hasn't changed meaningfully
                        if (Math.abs(width - (element.width || 0)) > 1 ||
                            Math.abs(height - (element.height || 0)) > 1) {
                            onLayout({
                                x: element.x || 0,
                                y: element.y || 0,
                                width,
                                height
                            });
                        }
                    }
                }}
            >
                <RichTextNode
                    id={element.id}
                    initialBlocks={element.blocks}
                    color={element.color}
                    isSelected={false}
                    scale={1}
                    onUpdate={() => { }}
                    backgroundColor={element.backgroundColor}
                    pointerEvents="auto"
                />
                {children}
            </Animated.View>
        </GestureDetector>
    );
};

export default function PageScreen() {
    const { id, notebookId, initialTitle, openComments } = useLocalSearchParams();
    const userContext = useAuth();
    const { user, userProfile } = userContext;
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [page, setPage] = useState<Page | null>(null);

    // Session State
    const [alertState, setAlertState] = useState<{
        visible: boolean;
        title: string;
        message: string;
        buttons?: { text: string; onPress: () => void; style?: 'cancel' | 'default' | 'destructive'; autoClose?: boolean }[]
    }>({ visible: false, title: '', message: '' });

    const showAlert = (title: string, message: string, buttons?: { text: string; onPress: () => void; style?: 'cancel' | 'default' | 'destructive'; autoClose?: boolean }[]) => {
        setAlertState({ visible: true, title, message, buttons });
    };

    const [isTimerRunning, setTimerRunning] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [isReviewModalVisible, setReviewModalVisible] = useState(false);
    const [pendingRetention, setPendingRetention] = useState(0.9); // Default 90%
    const [isEditing, setIsEditing] = useState(false); // Controls view vs edit mode
    const [isAnalyticsVisible, setAnalyticsVisible] = useState(false); // NEW
    const [isCommentsVisible, setCommentsVisible] = useState(false); // NEW

    useEffect(() => {
        if (openComments === 'true') {
            setCommentsVisible(true);
        }
    }, [openComments]);

    // Plan Time Modal (for teacher-assigned pages with no planned time)
    const [isPlanTimeModalVisible, setPlanTimeModalVisible] = useState(false);
    const [pendingPlannedTime, setPendingPlannedTime] = useState('');

    // Audio
    const { isPlaying, playSound, stopSound } = useFocusAudio();

    // --- CANVAS STATE ---
    const [elements, setElements] = useState<CanvasElement[]>([]);
    const [history, setHistory] = useState<CanvasElement[][]>([]);
    const [redoStack, setRedoStack] = useState<CanvasElement[][]>([]);
    const pageRef = useRef<Page | null>(null);

    // ... inside component
    // ... inside component
    // UNBOUNDED CANVAS STATE
    const [canvasBounds, setCanvasBounds] = useState(INITIAL_BOUNDS);
    const canvasBoundsRef = useRef(INITIAL_BOUNDS);

    // Derived Size for render
    const canvasWidth = (canvasBounds.maxX - canvasBounds.minX) || 1;
    const canvasHeight = (canvasBounds.maxY - canvasBounds.minY) || 1;

    console.log('[PageScreen] Render:', {
        bounds: canvasBounds,
        w: canvasWidth,
        h: canvasHeight,
        insets
    });

    if (isNaN(canvasWidth) || isNaN(canvasHeight)) {
        console.error('[PageScreen] Invalid Dimensions:', canvasWidth, canvasHeight);
    }

    // Active Drawing/Interaction State
    const [currentTool, setCurrentTool] = useState<Tool>('text'); // CHANGED DEFAULT
    const [currentShape, setCurrentShape] = useState<ShapeType>('rect');
    const [selectedColor, setSelectedColor] = useState('#000000');

    // --- ARROW STATE ---
    const [arrows, setArrows] = useState<Arrow[]>([]);
    const [arrowDrawState, setArrowDrawState] = useState<{
        sourceNodeId: string | null;
        sourceAnchor: AnchorPosition | null;
    }>({ sourceNodeId: null, sourceAnchor: null });
    const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null);

    // ... shared values
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const scale = useSharedValue(1.0); // Initial 1.0
    const canvasW = useSharedValue(PAGE_WIDTH * 3);
    const canvasH = useSharedValue(PAGE_HEIGHT * 3);
    // NEW Shared Values for Bounds (Required for Worklet access)
    const canvasMinX = useSharedValue(INITIAL_BOUNDS.minX);
    const canvasMinY = useSharedValue(INITIAL_BOUNDS.minY);
    const scrollbarOpacity = useSharedValue(0);

    useEffect(() => { canvasBoundsRef.current = canvasBounds; }, [canvasBounds]);

    // Sync shared values
    useEffect(() => {
        canvasW.value = canvasBounds.maxX - canvasBounds.minX;
        canvasH.value = canvasBounds.maxY - canvasBounds.minY;
        canvasMinX.value = canvasBounds.minX;
        canvasMinY.value = canvasBounds.minY;
    }, [canvasBounds]);

    const viewDimensions = useSharedValue({ width: 0, height: 0 });

    // Interaction Values
    // Start focused on Center Page (0,0). Screen (0,0) = World (0,0).
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);
    const savedScale = useSharedValue(1);
    const zoomFocalX = useSharedValue(0);
    const zoomFocalY = useSharedValue(0);

    // Coordinate Helper
    // --- HELPERS ---
    const pointToLineDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) // in case of 0 length line
            param = dot / len_sq;

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        }
        else if (param > 1) {
            xx = x2;
            yy = y2;
        }
        else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    };

    // Helper to get anchor point coordinates (matching ArrowConnector logic)
    const getAnchorPoint = (node: { x: number; y: number; width: number; height: number }, anchor: AnchorPosition) => {
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

    const handleCanvasTap = (x: number, y: number) => {
        // DEBUG: Log tap info
        console.log(`[handleCanvasTap] canvas=(${x.toFixed(0)}, ${y.toFixed(0)}) scale=${scale.value.toFixed(2)} tx=${translateX.value.toFixed(0)} ty=${translateY.value.toFixed(0)}`);

        // 0. Check Toolbar Safe Zone (Prevent closing when clicking toolbar)
        if (selectedArrowId) {
            const arrow = arrows.find(a => a.id === selectedArrowId);
            const source = elements.find(e => e.id === arrow?.sourceNodeId);
            const target = elements.find(e => e.id === arrow?.targetNodeId);

            if (arrow && source && target) {
                const mx = ((source.x || 0) + (target.x || 0)) / 2;
                const my = ((source.y || 0) + (target.y || 0)) / 2;
                const tbSafeX = mx - 40;
                const tbSafeY = my - 80;
                const tbSafeW = 390;
                const tbSafeH = 230;

                if (x >= tbSafeX && x <= tbSafeX + tbSafeW && y >= tbSafeY && y <= tbSafeY + tbSafeH) {
                    console.log("[handleCanvasTap] Ignored tap inside Toolbar Safe Zone");
                    return;
                }
            }
        }

        // 1. Check Arrow Hits (Math-based selection using actual anchor points)
        let hitArrowId: string | null = null;
        // Scale hit radius inversely with zoom so it stays consistent in screen space
        let minDist = 40 / (scale.value || 1);

        arrows.forEach(arrow => {
            const source = elements.find(e => e.id === arrow.sourceNodeId);
            const target = elements.find(e => e.id === arrow.targetNodeId);
            if (source && target) {
                const sourceNode = { x: source.x || 0, y: source.y || 0, width: source.width || 150, height: source.height || 100 };
                const targetNode = { x: target.x || 0, y: target.y || 0, width: target.width || 150, height: target.height || 100 };

                const sourceAnchor = getAnchorPoint(sourceNode, arrow.sourceAnchor);
                const targetAnchor = getAnchorPoint(targetNode, arrow.targetAnchor);

                const dist = pointToLineDistance(x, y, sourceAnchor.x, sourceAnchor.y, targetAnchor.x, targetAnchor.y);
                // DEBUG: Log each arrow distance
                console.log(`  Arrow ${arrow.id.slice(0, 8)}: dist=${dist.toFixed(1)} (threshold=${minDist.toFixed(1)}) src=(${sourceAnchor.x.toFixed(0)},${sourceAnchor.y.toFixed(0)}) tgt=(${targetAnchor.x.toFixed(0)},${targetAnchor.y.toFixed(0)})`);

                if (dist < minDist) {
                    minDist = dist;
                    hitArrowId = arrow.id;
                }
            }
        });

        if (hitArrowId) {
            console.log("Math Tap Hit Arrow:", hitArrowId);
            setSelectedArrowId(hitArrowId);
            return;
        }

        // 2. Deselect if hitting nothing
        setSelectedArrowId(null);
        setActiveTextInput(null);
    };

    const toCanvas = (screenX: number, screenY: number) => {
        'worklet';
        // Linear Transform: ViewSpace = (Screen - Translate) / Scale
        return {
            x: (screenX - translateX.value) / scale.value,
            y: (screenY - translateY.value) / scale.value
        };
    };

    // Temporary State for rendering while dragging
    const [currentPathString, setCurrentPathString] = useState<string>('');
    const [currentShapeBounds, setCurrentShapeBounds] = useState<{ sx: number, sy: number, ex: number, ey: number } | null>(null);

    // activeTextInput state
    const [activeTextInput, setActiveTextInput] = useState<{ id: string, x: number, y: number, text: string, scale?: number } | null>(null);
    const [showShapeMenu, setShowShapeMenu] = useState(false);
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);

    // Refs
    // Since we are moving to Gesture Handler, we don't strictly *need* all these refs for closure issues if we use runOnJS appropriately,
    // Refs for Gesture Handlers (Avoid Closure Staleness)
    const toolRef = useRef<Tool>('pen');
    const shapeRef = useRef<ShapeType>('rect');
    const colorRef = useRef('#000000');
    const drawingPathRef = useRef('');
    const shapeBoundsRef = useRef<{ sx: number, sy: number, ex: number, ey: number } | null>(null);
    const activeTextRef = useRef<{ id: string, x: number, y: number, text: string } | null>(null);
    const activeContentRef = useRef<RichTextBlock[] | null>(null); // Live content tracker
    const elementsRef = useRef(elements);
    const isGrowingRef = useRef(false);

    useEffect(() => { toolRef.current = currentTool; }, [currentTool]);
    useEffect(() => { shapeRef.current = currentShape; }, [currentShape]);
    useEffect(() => { colorRef.current = selectedColor; }, [selectedColor]);
    useEffect(() => { activeTextRef.current = activeTextInput; }, [activeTextInput]);
    useEffect(() => { elementsRef.current = elements; }, [elements]);

    // History Helpers... (keep existing)
    const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const addToHistory = () => {
        setHistory(prev => [...prev, elementsRef.current]);
        setRedoStack([]);
    };

    // ... (Undo/Redo logic same as before, omitted here for brevity if I could, but I must preserve it if replacing block)
    // --- ARROW HELPERS ---
    const handleArrowAnchorSelect = (nodeId: string, anchor: AnchorPosition) => {
        if (!arrowDrawState.sourceNodeId) {
            // Step 1: Select Source
            setArrowDrawState({ sourceNodeId: nodeId, sourceAnchor: anchor });
        } else {
            // Step 2: Select Target (if different)
            if (arrowDrawState.sourceNodeId === nodeId) {
                // Tapped same node? maybe change anchor? or cancel?
                // Let's just update anchor for now
                setArrowDrawState({ ...arrowDrawState, sourceAnchor: anchor });
                return;
            }

            // Create Arrow
            const newArrow: Arrow = {
                id: `arrow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                sourceNodeId: arrowDrawState.sourceNodeId,
                targetNodeId: nodeId,
                sourceAnchor: arrowDrawState.sourceAnchor!,
                targetAnchor: anchor,
                lineType: 'curved', // Default to curved for better aesthetics
                arrowEnds: 'end',
                lineStyle: 'solid',
                color: selectedColor || '#000000'
            };

            setArrows(prev => [...prev, newArrow]);

            // Log creation for undo/redo (integration later)
            // addToHistory();

            // Reset
            // Reset
            setArrowDrawState({ sourceNodeId: null, sourceAnchor: null });
            setSelectedArrowId(null); // Ensure toolbar does not auto-open
        }
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const previousState = history[history.length - 1];
        setRedoStack(prev => [elements, ...prev]);
        setElements(previousState);
        setHistory(prev => prev.slice(0, -1));
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const nextState = redoStack[0];
        setHistory(prev => [...prev, elements]);
        setElements(nextState);
        setRedoStack(prev => prev.slice(1));
    };

    // Helper to show/hide scrollbars
    const showScrollbars = () => {
        'worklet';
        scrollbarOpacity.value = withSpring(1);
    };
    const hideScrollbars = () => {
        'worklet';
        scrollbarOpacity.value = withDelay(1000, withSpring(0));
    };


    // --- GESTURES ---

    // 1. Pan Camera (Two Fingers)
    const cameraPan_legacy = Gesture.Pan() // Renamed to avoid current duplicate

        .minPointers(2)
        .maxPointers(2)
        .onStart(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            showScrollbars();
        })
        .onUpdate((e) => {
            // DYNAMIC PAGINATION: Clamp to current bounds
            // Viewport must stay within [0, CanvasWidth] of the View
            // T must satisfy: -(CanvasW - ScreenW) <= T <= 0

            const viewportW = viewDimensions.value.width || PAGE_WIDTH;
            const viewportH = viewDimensions.value.height || PAGE_HEIGHT;

            // Raw movement
            let nextTx = savedTranslateX.value + e.translationX;
            let nextTy = savedTranslateY.value + e.translationY;

            // Clamping
            const minTx = -(canvasW.value - viewportW);
            const minTy = -(canvasH.value - viewportH);

            // GROWTH TRIGGERS (If user drags PAST the clamp)
            // Note: We handle actual growth in `drawingGesture` mostly, but for Navigation 2-finger pan, 
            // the user expects to be able to "pull" a new page.
            // For now, let's keep it simple: Bounds restrict navigation. Tools (Pen) trigger expansion.
            // OR checks:
            // if (nextTx > 0) -> Trying to see Left of Left Page -> Trigger Left Growth?
            // User requested: "if user reaches bottom of bottom page... need new page to generate"

            // Let's Clamp strictly for now, rely on Drawing to expand??
            // User said: "if I add something to the left most area... need a page lefter to generated"
            // This is Drawing.
            // "if user reaches the bottom... need new page" implies Scrolling too.

            // Hard Clamp for Visual Stability first. Expansion requires SetState (JS).
            // We can use runOnJS to trigger expansion if we hit edge.

            translateX.value = Math.min(0, Math.max(minTx, nextTx));
            translateY.value = Math.min(0, Math.max(minTy, nextTy));
        })
        .onEnd(() => hideScrollbars());

    // 2. Zoom Camera (Pinch)
    const cameraZoom_legacy = Gesture.Pinch()
        .onStart((e) => {
            savedScale.value = scale.value;
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;

            // Calculate and store the canvas point under the focal point (Anchor)
            // Anchor = (ScreenFocal - CurrentTranslate) / CurrentScale
            zoomFocalX.value = (e.focalX - translateX.value) / scale.value;
            zoomFocalY.value = (e.focalY - translateY.value) / scale.value;

            showScrollbars();
        })
        .onUpdate((e) => {
            // Min Scale 0.25
            const newScale = Math.max(0.25, savedScale.value * e.scale);
            scale.value = newScale;

            // Update Translate to keep Anchor under current Focal Point
            // UNBOUNDED ZOOM - No Clamp
            translateX.value = e.focalX - zoomFocalX.value * newScale;
            translateY.value = e.focalY - zoomFocalY.value * newScale;
        })
        .onEnd(() => {
            savedScale.value = scale.value;
            hideScrollbars();
        });

    // 2.5 Navigation Pan (One Finger) - Only when Tool is Drag
    const navigationPan_legacy = Gesture.Pan()
        .enabled(currentTool === 'drag')
        .minPointers(1)
        .maxPointers(1)
        .onStart(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            showScrollbars();
        })
        .onUpdate((e) => {
            // UNBOUNDED SCROLLING - No Clamp
            translateX.value = savedTranslateX.value + e.translationX;
            translateY.value = savedTranslateY.value + e.translationY;
        })
        .onEnd(() => hideScrollbars());

    const commitTextSync = () => {
        // Using State-based Architecture
        if (!activeTextInput) return;

        const el = elementsRef.current.find(e => e.id === activeTextInput.id);
        if (!el) {
            setActiveTextInput(null);
            return;
        }

        // Check content: Priority to Live Ref, fallback to stored element
        const liveBlocks = activeContentRef.current;
        const blocksToCheck = liveBlocks || el.blocks;

        const hasText = blocksToCheck ?
            blocksToCheck.some(b => b.text && b.text.trim().length > 0) :
            (el.text && el.text.trim().length > 0);

        if (!hasText) {
            // DELETE EMPTY NODE
            console.log('Cleaning up empty node:', el.id);
            const newEls = elementsRef.current.filter(e => e.id !== el.id);
            setElements(newEls);
            elementsRef.current = newEls;
            pageRef.current = { ...pageRef.current!, contentJson: JSON.stringify(newEls) };
        } else {
            // SAVE CONTENT
            // If we have live blocks, ensure they are saved to state one last time
            if (liveBlocks) {
                const newEls = elementsRef.current.map(e => e.id === el.id ? { ...e, blocks: liveBlocks } : e);
                setElements(newEls);
                elementsRef.current = newEls;
                pageRef.current = { ...pageRef.current!, contentJson: JSON.stringify(newEls) };
            }

            // Checkpoint History on commit
            runOnJS(addToHistory)();
        }

        activeContentRef.current = null; // Clear ref
        setActiveTextInput(null);
    };

    const handleTextTap = (cx: number, cy: number) => {
        // 1. Commit/Save/Cleanup current active node if any
        if (activeTextInput) {
            commitTextSync(); // This uses activeContentRef to save properly!
            return;
        }

        // 2. Refresh baseElements from Ref (since commitTextSync might have updated it)
        let baseElements = elementsRef.current;

        console.log('handleTextTap called', cx, cy);

        // Check if we tapped on an EXISTING node (to select it, though usually gesture handles this)
        const hitIndex = baseElements.findIndex(el => {
            if (el.type !== 'text') return false;
            const wide = 200;
            const high = 100;
            return (
                cx >= (el.x || 0) &&
                cx <= (el.x || 0) + wide &&
                cy >= (el.y || 0) &&
                cy <= (el.y || 0) + high
            );
        });

        if (hitIndex === -1) {
            // Create NEW Text Node
            const newId = generateId();
            const initialBlocks: RichTextBlock[] = [{ id: '1', type: 'paragraph', text: '' }];
            const newElement: CanvasElement = {
                id: newId,
                x: cx,
                y: cy,
                type: 'text',
                color: selectedColor,
                blocks: initialBlocks,
                text: '',
                isNew: true
            };

            const newParams = [...baseElements, newElement]; // Append to CLEANED list
            setElements(newParams);
            pageRef.current = { ...pageRef.current!, contentJson: JSON.stringify(newParams) };

            // IMMEDIATE FOCUS
            setActiveTextInput({
                id: newId,
                x: cx,
                y: cy,
                text: '',
                scale: scale.value
            });
        }
    };

    // 3. Drawing (One Finger) - Disabled when Tool is Text OR Drag
    const drawingGesture_legacy = Gesture.Pan()
        .enabled(currentTool !== 'text' && currentTool !== 'drag')
        .runOnJS(true)
        .minPointers(1)
        .maxPointers(1)
        .onStart((e) => {
            if (activeTextRef.current) {
                runOnJS(commitTextSync)();
                return;
            }

            // Calculate Canvas Point
            const pt = toCanvas(e.absoluteX, e.absoluteY); // Caution: absoluteX might usually be screen coords, check View sizing
            // Actually e.x and e.y are relative to the view.
            // But our view is the transformed container? No, gesture handler should be on a wrapper.
            // We will put gesture handler on a stationary overlay.

            // Better: using e.x, e.y from a full-screen stationary view.
            const c = toCanvas(e.x, e.y); // using local coordinates of the handler view (which is full screen static)

            if (toolRef.current === 'pen') {
                drawingPathRef.current = `M${c.x.toFixed(1)},${c.y.toFixed(1)}`;
                runOnJS(setCurrentPathString)(drawingPathRef.current);
            } else if (toolRef.current === 'shape') {
                shapeBoundsRef.current = { sx: c.x, sy: c.y, ex: c.x, ey: c.y };
                runOnJS(setCurrentShapeBounds)(shapeBoundsRef.current);
            } else if (toolRef.current === 'text') {
                // HIT TEST requires mapping all elements to screen? Or mapping touch to canvas and checking bounds there.
                // Mapping touch to canvas is easier.
                const cx = c.x;
                const cy = c.y;

                // We need to run hit test on JS thread cause elements are in State
                runOnJS(handleTextTap)(cx, cy);
            }
        })
        .onUpdate((e) => {
            if (activeTextRef.current) return;
            const c = toCanvas(e.x, e.y);

            // Logic to grow canvas if drawing near edge (+/- 100px buffer)
            const currentBounds = canvasBoundsRef.current;
            const currentMinX = currentBounds.minX;
            const currentMinY = currentBounds.minY;
            const currentMaxX = currentBounds.maxX;
            const currentMaxY = currentBounds.maxY;

            let newMinX = currentMinX;
            let newMaxX = currentMaxX;
            let newMinY = currentMinY;
            let newMaxY = currentMaxY;
            let needsGrow = false;

            // Grow Right / Bottom
            if (c.x > currentMaxX - 100) {
                newMaxX += PAGE_WIDTH;
                needsGrow = true;
            }
            if (c.y > currentMaxY - 100) {
                newMaxY += PAGE_HEIGHT;
                needsGrow = true;
            }
            // Grow Left / Top
            if (c.x < currentMinX + 100) {
                newMinX -= PAGE_WIDTH;
                needsGrow = true;
            }
            if (c.y < currentMinY + 100) {
                newMinY -= PAGE_HEIGHT;
                needsGrow = true;
            }

            if (needsGrow && !isGrowingRef.current) {
                isGrowingRef.current = true;
                const newBounds = { minX: newMinX, minY: newMinY, maxX: newMaxX, maxY: newMaxY };

                // Compensation Math for CENTER SHIFT due to Bounds Change

                // Old Center (World)
                // Center = (min + max) / 2
                // We don't use Center-based scaling anchor in 'animatedStyle' anymore?
                // Wait, animatedStyle uses `(canvasW/2) * (1-scale)`.
                // `canvasW` is `max - min`.
                // This means `offX` is half the TOTAL width.
                // It effectively anchors the transform to the CENTER of the View.

                // If we grow Left (min decreases), `width` increases. Center moves left.
                // If we grow Right (max increases), `width` increases. Center moves right.

                const oldW = currentMaxX - currentMinX;
                const oldH = currentMaxY - currentMinY;
                const newW = newMaxX - newMinX;
                const newH = newMaxY - newMinY;

                // Change in Center Position (in World Coords, relative to View origin?)
                // Actually, let's look at the Shift in `offX/Y` (The visual anchor offset).

                const oldOffX = (oldW / 2) * (1 - scale.value);
                const newOffX = (newW / 2) * (1 - scale.value);
                const diffOffX = newOffX - oldOffX;

                // BUT, we also changed `left`.
                // `left` changed by `newMinX - oldMinX`.
                // Total visual shift = ChangeInLeft + ChangeInTransform.
                // We want Visual Shift to be 0.
                // `ChangeInLeft + ChangeInTransform + Compensation = 0`.
                // `ChangeInLeft` = `newMinX - oldMinX` (always <= 0).

                // Transform Change: `translateX - newOffX` vs `translateX - oldOffX`.
                // Change is `-diffOffX`.

                // So: `(newMinX - oldMinX) - diffOffX + Compensation = 0`.
                // `Compensation = diffOffX - (newMinX - oldMinX)`.

                const deltaMinX = newMinX - currentMinX;
                const deltaMinY = newMinY - currentMinY;

                const deltaOffX = ((newW - oldW) / 2) * (1 - scale.value);
                const deltaOffY = ((newH - oldH) / 2) * (1 - scale.value);

                const compX = deltaOffX - deltaMinX;
                const compY = deltaOffY - deltaMinY;

                translateX.value += compX;
                translateY.value += compY;
                savedTranslateX.value += compX;
                savedTranslateY.value += compY;

                runOnJS(setCanvasBounds)(newBounds);

                // Allow growth again after a delay to ensure state settles
                setTimeout(() => { isGrowingRef.current = false; }, 1000);
            }

            if (toolRef.current === 'pen') {
                drawingPathRef.current += ` L${c.x.toFixed(1)},${c.y.toFixed(1)}`;
                runOnJS(setCurrentPathString)(drawingPathRef.current);
            } else if (toolRef.current === 'shape' && shapeBoundsRef.current) {
                shapeBoundsRef.current.ex = c.x;
                shapeBoundsRef.current.ey = c.y;
                runOnJS(setCurrentShapeBounds)({ ...shapeBoundsRef.current });
            }
        })
        .onEnd(() => {
            if (activeTextRef.current) return;

            if (toolRef.current === 'pen') {
                if (drawingPathRef.current) {
                    runOnJS(addToHistory)();
                    const path = drawingPathRef.current; // Capture path
                    const color = colorRef.current; // Capture color

                    // Calculate Stroke Width based on current Scale
                    // If scale is 0.5 (zoomed out), we want line to be 6px (visible as 3px).
                    // If scale is 2 (zoomed in), we want line to be 1.5px (visible as 3px).
                    // Actually, the user requirement is: "line gets thinner when I draw in zoomed out state… the thickness of the line should not change"
                    // If I am zoomed out (scale < 1), everything on screen is smaller. If I draw a 3px line in SVG space, it renders as 3 * scale px.
                    // To make it LOOK like 3px on screen, I need to make the SVG stroke width = 3 / scale.
                    // This way 3/0.5 * 0.5 = 3px visible.
                    // When I zoom back in to scale=1, this line will be 6px.

                    const currentScale = scale.value || 1;
                    const adjustedStrokeWidth = 3 / currentScale;

                    // To prevent duplication, we must clear ref immediately.
                    drawingPathRef.current = '';
                    runOnJS(setCurrentPathString)('');

                    runOnJS(setElements)(prev => {
                        // Safety: check if this path was JUST added (deduplication)
                        const last = prev[prev.length - 1];
                        if (last && last.type === 'path' && last.d === path) return prev;

                        const newEl: CanvasElement = {
                            id: `${Date.now()}-${Math.random()}`,
                            type: 'path',
                            color: color,
                            d: path,
                            strokeWidth: adjustedStrokeWidth
                        };
                        return [...prev, newEl];
                    });
                }
            } else if (toolRef.current === 'shape') {
                if (shapeBoundsRef.current) {
                    runOnJS(addToHistory)();
                    const b = shapeBoundsRef.current;
                    const newEl: CanvasElement = {
                        id: generateId(),
                        type: 'shape',
                        color: colorRef.current,
                        shapeType: shapeRef.current,
                        startX: b.sx,
                        startY: b.sy,
                        endX: b.ex,
                        endY: b.ey
                    };
                    runOnJS(setElements)(prev => [...prev, newEl]);
                    shapeBoundsRef.current = null;
                    runOnJS(setCurrentShapeBounds)(null);
                }
            }
        });



    // 4. Text Tap Gesture (Enabled only when Tool is Text)
    const textTapGesture_legacy = Gesture.Tap()
        .enabled(currentTool === 'text')
        // removed maxDistance to allow simple taps (dots)
        .runOnJS(true)
        .onEnd((e) => {
            const c = toCanvas(e.x, e.y);
            runOnJS(handleTextTap)(c.x, c.y);
        });

    // Composed Gesture
    // 2-finger Pan and Pinch work together (Simultaneous).
    // 1-finger Pan is exclusive (for drawing).




    // --- UNIFIED CAMERA TRANSFORM ---
    // IMPORTANT: translate BEFORE scale so that screen = canvas*s + tx
    // (matching the toCanvas inverse formula)
    const cameraStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { scale: scale.value }
            ]
        };
    });

    const animatedGProps = useAnimatedProps(() => {
        return {
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { scale: scale.value }
            ]
        };
    });

    const isFinite = (n: number) => typeof n === 'number' && Number.isFinite(n);

    // --- GESTURES (Memoized) ---

    const cameraPan = useMemo(() => Gesture.Pan()
        .minPointers(2)
        .maxPointers(2)
        .onStart(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            showScrollbars();
        })
        .onUpdate((e) => {
            const viewportW = viewDimensions.value.width || PAGE_WIDTH;
            const viewportH = viewDimensions.value.height || PAGE_HEIGHT;
            let nextTx = savedTranslateX.value + e.translationX;
            let nextTy = savedTranslateY.value + e.translationY;
            const minTx = -(canvasW.value - viewportW);
            const minTy = -(canvasH.value - viewportH);
            translateX.value = Math.min(0, Math.max(minTx, nextTx));
            translateY.value = Math.min(0, Math.max(minTy, nextTy));
        })
        .onEnd(() => hideScrollbars()), [canvasW, canvasH, translateX, translateY, savedTranslateX, savedTranslateY]);



    const cameraZoom = useMemo(() => Gesture.Pinch()
        .onStart((e) => {
            savedScale.value = scale.value;
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            zoomFocalX.value = (e.focalX - translateX.value) / scale.value;
            zoomFocalY.value = (e.focalY - translateY.value) / scale.value;
            showScrollbars();
        })
        .onUpdate((e) => {
            const newScale = Math.max(0.25, savedScale.value * e.scale);
            if (isFinite(newScale)) {
                scale.value = newScale;
                translateX.value = e.focalX - zoomFocalX.value * newScale;
                translateY.value = e.focalY - zoomFocalY.value * newScale;
            }
        })
        .onEnd(() => {
            savedScale.value = scale.value;
            hideScrollbars();
        }), [scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY]);

    const navigationPan = useMemo(() => Gesture.Pan()
        .enabled(currentTool === 'drag' || !isEditing)
        .minPointers(1)
        .maxPointers(1)
        .onStart(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            showScrollbars();
        })
        .onUpdate((e) => {
            translateX.value = savedTranslateX.value + e.translationX;
            translateY.value = savedTranslateY.value + e.translationY;
        })
        .onEnd(() => hideScrollbars()), [currentTool, isEditing, translateX, translateY, savedTranslateX, savedTranslateY]);

    const drawingGesture = useMemo(() => Gesture.Pan()
        .enabled(currentTool !== 'text' && currentTool !== 'drag')
        .runOnJS(true)
        .minPointers(1)
        .maxPointers(1)
        .onStart((e) => {
            if (activeTextRef.current) {
                runOnJS(commitTextSync)();
                return;
            }
            // CRITICAL: Use e.x / e.y for strict local coordinates (avoids status bar shift)
            const c = toCanvas(e.x, e.y);
            if (!isFinite(c.x) || !isFinite(c.y)) return;

            if (toolRef.current === 'pen') {
                drawingPathRef.current = `M${c.x.toFixed(1)},${c.y.toFixed(1)}`;
                runOnJS(setCurrentPathString)(drawingPathRef.current);
            } else if (toolRef.current === 'shape') {
                shapeBoundsRef.current = { sx: c.x, sy: c.y, ex: c.x, ey: c.y };
                runOnJS(setCurrentShapeBounds)(shapeBoundsRef.current);
            } else if (toolRef.current === 'text') {
                runOnJS(handleTextTap)(c.x, c.y);
            }
        })
        .onUpdate((e) => {
            if (activeTextRef.current) return;
            const c = toCanvas(e.x, e.y);
            if (!isFinite(c.x) || !isFinite(c.y)) return;

            if (toolRef.current === 'pen') {
                if (!drawingPathRef.current) {
                    drawingPathRef.current = `M${c.x.toFixed(1)},${c.y.toFixed(1)}`;
                }
                const newPoint = ` L${c.x.toFixed(1)},${c.y.toFixed(1)}`;
                drawingPathRef.current += newPoint;
                runOnJS(setCurrentPathString)(drawingPathRef.current);
            } else if (toolRef.current === 'shape' && shapeBoundsRef.current) {
                shapeBoundsRef.current.ex = c.x;
                shapeBoundsRef.current.ey = c.y;
                runOnJS(setCurrentShapeBounds)({ ...shapeBoundsRef.current });
            }
        })
        .onEnd(() => {
            if (activeTextRef.current) return;
            if (toolRef.current === 'pen' && drawingPathRef.current) {
                runOnJS(addToHistory)();
                const path = drawingPathRef.current;
                const color = colorRef.current;
                const currentScale = scale.value || 1;
                const adjustedStrokeWidth = 3 / currentScale;

                drawingPathRef.current = '';
                runOnJS(setCurrentPathString)('');

                runOnJS(setElements)(prev => {
                    return [...prev, {
                        id: `${Date.now()}-${Math.random()}`,
                        type: 'path',
                        color,
                        d: path,
                        strokeWidth: adjustedStrokeWidth
                    }];
                });
            } else if (toolRef.current === 'shape' && shapeBoundsRef.current) {
                runOnJS(addToHistory)();
                const b = shapeBoundsRef.current;
                const newEl: CanvasElement = { id: generateId(), type: 'shape', color: colorRef.current, shapeType: shapeRef.current, startX: b.sx, startY: b.sy, endX: b.ex, endY: b.ey };
                runOnJS(setElements)(prev => [...prev, newEl]);
                shapeBoundsRef.current = null;
                runOnJS(setCurrentShapeBounds)(null);
            }
        }), [currentTool, scale, translateX, translateY]);

    const canvasTapGesture = useMemo(() => Gesture.Tap()
        .enabled(isEditing)
        .runOnJS(true)
        .onEnd((e) => {
            const c = toCanvas(e.x, e.y);
            console.log(`[Gesture] Tap raw=${e.x.toFixed(0)},${e.y.toFixed(0)} canvas=${c.x.toFixed(0)},${c.y.toFixed(0)}`);
            if (isFinite(c.x) && isFinite(c.y)) {
                if (currentTool === 'text') {
                    runOnJS(handleTextTap)(c.x, c.y);
                } else {
                    runOnJS(handleCanvasTap)(c.x, c.y);
                }
            }
        }), [isEditing, currentTool, scale, translateX, translateY, handleTextTap, arrows, elements]); // Added deps

    const composedGesture = useMemo(() => Gesture.Simultaneous(
        cameraPan,
        cameraZoom,
        // drawingGesture, // Removed
        canvasTapGesture,
        navigationPan
    ), [cameraPan, cameraZoom, canvasTapGesture, navigationPan]);


    const vScrollStyle = useAnimatedStyle(() => {
        const viewportH = viewDimensions.value.height;
        const contentH = canvasH.value * scale.value;
        if (contentH <= viewportH) return { opacity: 0 };

        const height = (viewportH / contentH) * viewportH;
        // translateY is negative (panning up moves content up, so we see further down)
        // We want scrollbar position. 
        // ScrollRatio = -translateY / (contentH - viewportH).
        // ScrollbarTop = ScrollRatio * (viewportH - height).
        // OR simpler: Top = (-translateY / contentH) * viewportH ? No.

        // Accurate Scrollbar mapping:
        // P = percent scrolled = -translateY / (contentH - viewportH)
        // BarTop = P * (viewportH - height)

        // Clamped TranslateY is roughly 0 to -(contentH - viewportH).
        const maxTranslate = contentH - viewportH;
        const p = maxTranslate > 0 ? -translateY.value / maxTranslate : 0;
        const top = p * (viewportH - height);

        return {
            position: 'absolute',
            right: 4,
            width: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(0,0,0,0.5)',
            height: height,
            top: top,
            opacity: scrollbarOpacity.value,
        };
    });

    const hScrollStyle = useAnimatedStyle(() => {
        const viewportW = viewDimensions.value.width;
        const contentW = canvasW.value * scale.value;
        if (contentW <= viewportW) return { opacity: 0 };

        const width = (viewportW / contentW) * viewportW;
        const maxTranslate = contentW - viewportW;
        const p = maxTranslate > 0 ? -translateX.value / maxTranslate : 0;
        const left = p * (viewportW - width);

        return {
            position: 'absolute',
            bottom: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(0,0,0,0.5)',
            width: width,
            left: left,
            opacity: scrollbarOpacity.value,
        };
    });




    // --- DATA LOADING & LOGIC ---

    useEffect(() => {
        if (id) {
            // DEV BYPASS: If test user, allow working with 'fake' pages that don't exist in DB
            if (user?.uid === 'test-user-123') {
                // Try to find it in mockPages first (if returned to it)
                const existingMock = userContext.mockPages?.find(p => p.id === id);
                if (existingMock) {
                    setPage(existingMock);
                    if (existingMock.contentJson) {
                        try {
                            setElements(JSON.parse(existingMock.contentJson));
                            // Add initial state to history so undo works from load state
                            setHistory([JSON.parse(existingMock.contentJson)]);
                        } catch (e) {
                            console.error("Failed to parse content", e);
                        }
                    }
                    if (!existingMock.isCompleted) {
                        // If not completed, we are in initial learning phase
                        setIsEditing(true);
                    }
                } else {
                    // Create new ephemeral draft
                    const newPage = {
                        id: id as string,
                        title: (initialTitle as string) || 'New Topic (Draft)',
                        notebookId: (notebookId as string) || 'mock-notebook',
                        createdAt: Date.now(),
                        repetitionCount: 0,
                        rFactor: 2.5,
                        interval: 0,
                        actualTimeMinutes: 0
                    } as Page;
                    setPage(newPage);
                }
                return;
            }

            getDoc(doc(db, 'pages', id as string)).then(snap => {
                if (snap.exists()) {
                    const data = { id: snap.id, ...snap.data() } as Page;
                    setPage(data);
                    if (data.contentJson) {
                        try {
                            setElements(JSON.parse(data.contentJson));
                            setHistory([JSON.parse(data.contentJson)]);
                        } catch (e) { console.error(e); }
                    }

                    // CHECK FOR ACTIVE SESSION (Offline Support)
                    if (data.currentSessionStart) {
                        const now = Date.now();
                        const elapsedMs = now - data.currentSessionStart;
                        const elapsedSecs = Math.floor(elapsedMs / 1000);
                        if (elapsedSecs > 0) {
                            setElapsedSeconds(elapsedSecs);
                            setTimerRunning(true);
                            setIsEditing(true);
                        }
                    }
                } else {
                    showAlert("Error", "Page not found");
                }
            });
        }
    }, [id, user, notebookId, initialTitle]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isTimerRunning) {
            interval = setInterval(() => {
                setElapsedSeconds(s => s + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isTimerRunning]);

    // Handle App Background/Foreground State for Timer Accuracy
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active' && page?.currentSessionStart) {
                // Recalculate elapsed time from the source of truth timestamp
                const now = Date.now();
                const diffMs = now - page.currentSessionStart;
                const recSecs = Math.floor(diffMs / 1000);
                if (recSecs >= 0) {
                    setElapsedSeconds(recSecs);
                }
            }
        });

        return () => {
            subscription.remove();
        };
    }, [page]);

    const formatTime = (seconds: number) => {
        const total = Math.floor(seconds);
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // --- ACTIONS ---
    const updatePageSession = async (updates: Partial<Page>) => {
        if (!page) return;
        try {
            await updateDoc(doc(db, 'pages', page.id), updates);

            // Clean up local updates (handle deleteField)
            const localUpdates: any = { ...updates };
            if (localUpdates.currentSessionStart && typeof localUpdates.currentSessionStart !== 'number') {
                localUpdates.currentSessionStart = undefined; // Clear locally
            }

            setPage(prev => prev ? { ...prev, ...localUpdates } : null);
        } catch (e) {
            console.error("Failed to update session", e);
        }
    };

    const handleSaveContent = async () => {
        if (!page) return;
        // Serialize and Save using REF to ensure latest state
        const currentElements = elementsRef.current; // Use Ref
        const contentJson = JSON.stringify(currentElements);

        // Calculate pending time if timer is running
        let newActualTime = page.actualTimeMinutes || 0;
        let newSessionStart = page.currentSessionStart;

        // If saving while running, we don't stop the timer, but we should probably checkpoint? 
        // Actually, for simple content save, we might not need to touch the timer unless we are "Leaving".

        const updatedPage = { ...page, contentJson } as Page;

        // DEV BYPASS
        if (user?.uid === 'test-user-123') {
            if (userContext.addMockPage) {
                userContext.addMockPage(updatedPage);
            }
            setPage(updatedPage);
            return;
        }

        // FIREBASE SAVE
        try {
            // Sanitize
            const buildPayload = (p: Page) => {
                const payload: any = {};
                if (contentJson !== undefined) payload.contentJson = contentJson;
                if (p.retentionTarget !== undefined) payload.retentionTarget = p.retentionTarget;
                if (p.plannedTimeMinutes !== undefined) payload.plannedTimeMinutes = p.plannedTimeMinutes;
                if (p.actualTimeMinutes !== undefined) payload.actualTimeMinutes = p.actualTimeMinutes;
                if (p.isCompleted !== undefined) payload.isCompleted = p.isCompleted;
                if (p.completedAt !== undefined) payload.completedAt = p.completedAt;
                if (p.interval !== undefined && !Number.isNaN(p.interval)) payload.interval = p.interval;
                if (p.rFactor !== undefined && !Number.isNaN(p.rFactor)) payload.rFactor = p.rFactor;
                if (p.currentSessionStart !== undefined) payload.currentSessionStart = p.currentSessionStart; // ADDED
                return payload;
            };

            await updateDoc(doc(db, 'pages', page.id), buildPayload(updatedPage));
            setPage(updatedPage);
        } catch (e) {
            console.error("Failed to save content", e);
            showAlert("Error", "Could not save changes.");
        }
    };

    const toggleEditMode = async () => {
        console.log("Toggle Edit Mode Pressed");
        if (isEditing) {
            // User is clicking "Check" -> Save content
            await handleSaveContent();
            showAlert("Saved", "Content saved successfully."); // Feedback for user
        }
        setIsEditing(!isEditing);
    };

    const handleClearPage = () => {
        Alert.alert(
            "Clear Page",
            "Are you sure you want to delete everything? This cannot be undone easily.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear", style: 'destructive', onPress: () => {
                        // Optional: Save to history before clearing to allow Undo
                        setHistory(prev => [...prev, elements]);
                        setRedoStack([]);
                        setElements([]);
                    }
                }
            ]
        );
    };

    const handleUpdateRetention = async (target: number) => {
        setPendingRetention(target);
        if (page) {
            const updated = { ...page, retentionTarget: target };
            setPage(updated);
            try {
                await updateDoc(doc(db, 'pages', page.id), { retentionTarget: target });
            } catch (e) { console.error(e); }
        }
        setShowSettingsMenu(false);
    };

    const handleStartSession = () => {
        console.log("Start Session Pressed", page ? "Page exists" : "No page");
        if (!page) return; // Safety check
        // Check if this is a teacher-assigned page with no planned time
        if (page.managedBy && (!page.plannedTimeMinutes || page.plannedTimeMinutes === 0)) {
            console.log("Opening Plan Time Modal");
            setPlanTimeModalVisible(true);
            return;
        }
        setTimerRunning(true);
        setIsEditing(true); // Allow editing when session starts
        updatePageSession({ currentSessionStart: Date.now() });
    };

    // Handle saving planned time and starting session
    const handleSavePlannedTimeAndStart = async (startNow = true) => {
        const minutes = parseInt(pendingPlannedTime, 10);
        if (isNaN(minutes) || minutes <= 0) {
            showAlert('Invalid Time', 'Please enter a valid number of minutes.');
            return;
        }

        try {
            // Update page with planned time
            await updateDoc(doc(db, 'pages', id as string), {
                plannedTimeMinutes: minutes,
                updatedAt: Date.now()
            });

            // Update local state
            if (page) {
                setPage({ ...page, plannedTimeMinutes: minutes });
            }

            setPlanTimeModalVisible(false);
            setPendingPlannedTime('');

            if (startNow) {
                setTimerRunning(true);
                setIsEditing(true);
                updatePageSession({ currentSessionStart: Date.now() });
            }
        } catch (e) {
            console.error(e);
            showAlert('Error', 'Failed to save planned time.');
        }
    };

    const handleOpenReview = async () => {
        // Save current content before reviewing
        await handleSaveContent();

        // Initialize retention from current page state (which might have been edited)
        setPendingRetention(page?.retentionTarget || 0.9);
        setReviewModalVisible(true);
    };

    const handleEndSession = () => {
        setTimerRunning(false);
        setIsEditing(false); // Disable editing so user must "Resume" to edit again
        handleOpenReview();
    };

    const submitReview = async (difficulty: number) => {
        if (!page) {
            showAlert("Error", "Page data not found.");
            return;
        }

        const normalizedDifficulty = (difficulty - 1) / 9;

        const currentState = {
            repetitionCount: page.repetitionCount || INITIAL_SM18_STATE.repetitionCount,
            rFactor: page.rFactor || INITIAL_SM18_STATE.rFactor,
            interval: page.interval || INITIAL_SM18_STATE.interval,
            difficultyRating: normalizedDifficulty,
            retentionTarget: pendingRetention
        };

        const nextReview = calculateNextReview(currentState);

        // Serialize Content using REF to ensure latest state
        const currentElements = elementsRef.current;
        const contentJson = JSON.stringify(currentElements);

        const updatedData: any = {
            ...page,
            actualTimeMinutes: (page.actualTimeMinutes || 0) + (page.currentSessionStart ? (Date.now() - page.currentSessionStart) / 60000 : elapsedSeconds / 60),
            isCompleted: true, // Mark as completed (or reviewed)
            completedAt: Date.now(),
            contentJson,
            retentionTarget: pendingRetention, // Save user preference
            ...nextReview
        };

        // Safety Defaults
        if (Number.isNaN(updatedData.interval) || updatedData.interval === undefined) updatedData.interval = 1;
        if (Number.isNaN(updatedData.rFactor) || updatedData.rFactor === undefined) updatedData.rFactor = 2.5;

        // Sanitize Payload for Firestore (Remove undefined)
        const sanitizePayload = (obj: any) => {
            const clean: any = {};
            Object.keys(obj).forEach(key => {
                if (obj[key] !== undefined) clean[key] = obj[key];
            });
            return clean;
        };

        try {
            await updateDoc(doc(db, 'pages', id as string), sanitizePayload(updatedData));
            setPage(updatedData);
            setReviewModalVisible(false);
            showAlert("Great Job!", `Review logged. Next review in ${Math.round(updatedData.interval)} days.`);
            router.back();
        } catch (e) {
            console.error("Save Error", e);
            showAlert("Error", "Could not save progress. Please try again.");
        }



        // DEV BYPASS
        if (user?.uid === 'test-user-123') {
            if (userContext.addMockPage) {
                userContext.addMockPage(updatedData);
            }
            showAlert("Saved!", "Review complete. Notes saved to offline brain.");
            setReviewModalVisible(false);
            setPage(updatedData);
            router.back();
            return;
        }

        try {
            await updateDoc(doc(db, 'pages', page.id), {
                actualTimeMinutes: updatedData.actualTimeMinutes,
                isCompleted: true,
                completedAt: Date.now(),
                contentJson,
                retentionTarget: pendingRetention,
                currentSessionStart: deleteField(),
                ...nextReview
            });

            const delaySeconds = nextReview.interval * 24 * 60 * 60;
            await scheduleReviewNotification(page.title, delaySeconds);

            setReviewModalVisible(false);
            router.back();
        } catch (e) {
            console.error(e);
            showAlert("Error", "Failed to save progress. Please try again.");
        }
    };

    // --- RENDER HELPERS ---
    const renderShape = (el: CanvasElement, isPreview = false) => {
        const sx = el.startX || 0;
        const sy = el.startY || 0;
        const ex = el.endX || 0;
        const ey = el.endY || 0;
        const color = el.color;
        const width = ex - sx;
        const height = ey - sy;

        const commonProps = {
            stroke: color,
            strokeWidth: 2,
            fill: "none"
        };

        const getArrowHead = (x1: number, y1: number, x2: number, y2: number) => {
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = 15;
            const p1 = `${x2},${y2}`;
            const p2 = `${x2 - headLen * Math.cos(angle - Math.PI / 6)},${y2 - headLen * Math.sin(angle - Math.PI / 6)}`;
            const p3 = `${x2 - headLen * Math.cos(angle + Math.PI / 6)},${y2 - headLen * Math.sin(angle + Math.PI / 6)}`;
            return <Polygon points={`${p1} ${p2} ${p3}`} fill={color} />;
        };

        switch (el.shapeType) {
            case 'rect':
                return <Rect x={Math.min(sx, ex)} y={Math.min(sy, ey)} width={Math.abs(width)} height={Math.abs(height)} {...commonProps} />;
            case 'circle':
                const r = Math.sqrt(width * width + height * height) / 2;
                return <Circle cx={(sx + ex) / 2} cy={(sy + ey) / 2} r={r} {...commonProps} />;
            case 'triangle':
                return <Polygon points={`${sx + width / 2},${sy} ${sx},${ey} ${ex},${ey}`} {...commonProps} />;
            case 'line':
                return <Line x1={sx} y1={sy} x2={ex} y2={ey} {...commonProps} />;
            case 'dotted-line':
                return <Line x1={sx} y1={sy} x2={ex} y2={ey} {...commonProps} strokeDasharray="5, 5" />;
            case 'arrow':
                return (
                    <React.Fragment>
                        <Line x1={sx} y1={sy} x2={ex} y2={ey} {...commonProps} />
                        {getArrowHead(sx, sy, ex, ey)}
                    </React.Fragment>
                );
            case 'dotted-arrow':
                return (
                    <React.Fragment>
                        <Line x1={sx} y1={sy} x2={ex} y2={ey} {...commonProps} strokeDasharray="5, 5" />
                        {getArrowHead(sx, sy, ex, ey)}
                    </React.Fragment>
                );
            default:
                return null;
        }
    };

    // --- NAVIGATION & BACK HANDLING ---
    // --- NAVIGATION & BACK HANDLING ---
    useEffect(() => {
        const onBackPress = () => {
            // Priority 1: Close Modals
            if (isReviewModalVisible) {
                setReviewModalVisible(false);
                return true;
            }
            if (isPlanTimeModalVisible) {
                setPlanTimeModalVisible(false);
                return true;
            }
            if (isAnalyticsVisible) {
                setAnalyticsVisible(false);
                return true;
            }
            if (isCommentsVisible) {
                setCommentsVisible(false);
                return true;
            }

            // Priority 2: Handle Session (ALLOW DEFAULT NAV)
            // User requested to remove active session check.
            // if (isTimerRunning) { ... } removed.

            return false; // Allow default behavior
        };

        const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => backHandler.remove();
    }, [isTimerRunning, elapsedSeconds, page, isReviewModalVisible, isPlanTimeModalVisible, isAnalyticsVisible, isCommentsVisible]);

    const handlePauseSession = async (navigateBack = true) => {
        setTimerRunning(false);
        setIsEditing(false); // <--- Disable editing when paused
        if (!page) { if (navigateBack) router.back(); return; }

        // Determine added time
        let addedMinutes = 0;
        if (page.currentSessionStart) {
            const duration = Date.now() - page.currentSessionStart;
            addedMinutes = duration / 60000;
        } else {
            addedMinutes = elapsedSeconds / 60;
        }

        const updatedPage: Page = {
            ...page,
            actualTimeMinutes: (page.actualTimeMinutes || 0) + addedMinutes,
            contentJson: JSON.stringify(elements),
            currentSessionStart: undefined // Clear locally
        };

        // Save
        setPage(updatedPage); // Update local state immediately
        setElapsedSeconds(0); // Reset immediately to prevent double-counting flash

        if (user?.uid === 'test-user-123') {
            if (userContext.addMockPage) userContext.addMockPage(updatedPage);
        } else {
            try {
                await updateDoc(doc(db, 'pages', page.id), {
                    actualTimeMinutes: updatedPage.actualTimeMinutes,
                    contentJson: updatedPage.contentJson,
                    currentSessionStart: deleteField()
                });
            } catch (e) { console.error(e); }
        }

        if (navigateBack) router.back();
    };

    const handleGoHome = () => {
        // User requested to remove active session check.
        router.navigate('/student/(tabs)');
    };


    const navigation = useNavigation();

    // --- HEADER CONFIGURATION ---
    React.useLayoutEffect(() => {
        navigation.setOptions({
            headerLeft: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, marginRight: 10 }}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => router.back()}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={handleGoHome}>
                        <MaterialCommunityIcons name="home" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>
            ),
            headerTitle: () => (
                <View style={[styles.headerTitle, { flex: 1, maxWidth: 200 }]}>
                    <Text style={[styles.title, { color: '#fff' }]} numberOfLines={1} ellipsizeMode="tail">{page?.title || "Topic"}</Text>
                    {!page?.isCompleted ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[styles.timer, { color: 'white' }]}>{formatTime((page?.actualTimeMinutes || 0) * 60 + elapsedSeconds)}</Text>
                        </View>
                    ) : (
                        <Text style={[styles.timer, { color: '#aaa' }]}>{page?.actualTimeMinutes ? `${page.actualTimeMinutes.toFixed(1)} min` : '< 1 min'}</Text>
                    )}
                </View >
            ),
            headerRight: () => (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    {/* Comments Button (Always Visible) */}
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setCommentsVisible(true)}>
                        <View style={[styles.timerBtn, { backgroundColor: '#444' }]}>
                            <MaterialCommunityIcons name="comment-text-multiple" size={20} color="white" />
                        </View>
                    </TouchableOpacity>

                    {/* Logic for Finish/Resume Buttons */}
                    {(isTimerRunning || (elapsedSeconds > 0 && !page?.isCompleted) || (page?.actualTimeMinutes || 0) > 0) ? (
                        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                            {/* Play/Pause Toggle - PROMINENT */}
                            <TouchableOpacity
                                onPress={async () => {
                                    if (isTimerRunning) {
                                        await handlePauseSession(false);
                                    } else {
                                        setTimerRunning(true);
                                        setIsEditing(true);
                                        await updatePageSession({ currentSessionStart: Date.now() });
                                    }
                                }}
                            >
                                <View style={[styles.timerBtn, { backgroundColor: isTimerRunning ? '#FF9800' : '#4CAF50', paddingHorizontal: 12 }]}>
                                    <MaterialCommunityIcons
                                        name={isTimerRunning ? "pause" : "play"}
                                        size={22}
                                        color="white"
                                    />
                                </View>
                            </TouchableOpacity>

                            {/* Finish Button - ALWAYS VISIBLE */}
                            <TouchableOpacity onPress={handleEndSession}>
                                <View style={[styles.timerBtn, styles.stopBtn]}>
                                    <Text style={styles.timerBtnText}>Finish</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {!page?.isCompleted ? (
                                <TouchableOpacity onPress={handleStartSession}>
                                    <View style={[styles.timerBtn, styles.startBtn]}>
                                        <Text style={styles.timerBtnText}>Start</Text>
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <>
                                    <TouchableOpacity onPress={toggleEditMode}>
                                        <View style={[styles.timerBtn, { backgroundColor: isEditing ? '#4CAF50' : '#ddd' }]}>
                                            <MaterialCommunityIcons name={isEditing ? "check" : "pencil"} size={16} color="black" />
                                        </View>
                                    </TouchableOpacity>
                                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setAnalyticsVisible(true)}>
                                        <View style={[styles.timerBtn, { backgroundColor: '#FF9800' }]}>
                                            <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={16} color="white" />
                                        </View>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={handleOpenReview}>
                                        <View style={[styles.timerBtn, { backgroundColor: '#2196F3' }]}>
                                            <Text style={styles.timerBtnText}>Log Review</Text>
                                        </View>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    )}
                </View>
            ),
            headerStyle: { backgroundColor: '#121212' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
        });
    }, [navigation, page, isTimerRunning, elapsedSeconds, isEditing, showSettingsMenu, showShapeMenu]);

    // -- Back Button for Review Modal --
    const handleCloseReview = () => {
        setReviewModalVisible(false);
    };

    return (
        <View style={[styles.safeArea, { backgroundColor: '#121212', flex: 1 }]}>
            <StatusBar barStyle="light-content" backgroundColor="#121212" translucent={false} />
            <View style={[styles.container, { marginBottom: insets.bottom, flex: 1 }]}>


                {/* MAIN CANVAS - INFINITE */}
                {/* 
                   We remove 'overflow: hidden' to allow drawing "outside" the visible bounds if needed conceptually,
                   but practically the SVG is full screen. The key is the transformation logic.
                   However, for "infinite" feel, we essentially just need the canvas to NOT clip content 
                   that is technically "off-screen" until we pan it into view.
                   By using a full-screen SVG + Transform, we achieve this for the VIEWPORT.
                 */}
                <View style={{ flex: 1, backgroundColor: '#fff' }}>
                    {/* 
                         Note: Removed overflow: hidden to allow drawing outside visible bounds. 
                         Changed background to #fff to avoid "dim" effect.
                     */}
                    <View
                        style={{ flex: 1 }}
                        onLayout={(e) => {
                            viewDimensions.value = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
                        }}
                    >
                        {/* WRAPPED GESTURE DETECTOR: Covers everything */}
                        <GestureDetector gesture={composedGesture}>
                            <View style={{ flex: 1 }}>
                                {/* LAYER 1: Background Gestures (Pan/Zoom on empty space) */}
                                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent', zIndex: 0 }]} />




                                {/* LAYER 2.5: Arrows (AnimatedG Implementation) */}
                                {/* When arrow tool is active, arrows need higher z-index to be tappable over nodes */}
                                <Svg style={[StyleSheet.absoluteFill, { zIndex: currentTool === 'arrow' ? 10 : 1 }]} pointerEvents="box-none">
                                    <AnimatedG animatedProps={animatedGProps}>
                                        {/* Calibration Rect REMOVED */}

                                        {useMemo(() => {
                                            return arrows.map((arrow) => {
                                                const sourceNode = elements.find(e => e.id === arrow.sourceNodeId);
                                                const targetNode = elements.find(e => e.id === arrow.targetNodeId);
                                                if (!sourceNode || !targetNode) return null;

                                                return (
                                                    <ArrowConnector
                                                        key={`${arrow.id}-${arrow.lineStyle}-${arrow.arrowEnds}-${arrow.color}-${arrow.lineType}`}
                                                        arrow={arrow}
                                                        sourceNode={{
                                                            x: sourceNode.x || 0,
                                                            y: sourceNode.y || 0,
                                                            width: sourceNode.width || 150,
                                                            height: sourceNode.height || 100
                                                        }}
                                                        targetNode={{
                                                            x: targetNode.x || 0,
                                                            y: targetNode.y || 0,
                                                            width: targetNode.width || 150,
                                                            height: targetNode.height || 100
                                                        }}
                                                        scale={scale.value || 1}
                                                        isSelected={selectedArrowId === arrow.id}
                                                        onSelect={() => setSelectedArrowId(arrow.id)}
                                                    />
                                                );
                                            });
                                        }, [elements, arrows, selectedArrowId, scale])}
                                    </AnimatedG>
                                </Svg>

                                {/* LAYER 3: Nodes + Toolbar (Top Layer) */}
                                <Animated.View style={[
                                    { position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'visible', zIndex: 2 },
                                    cameraStyle
                                ]} pointerEvents="box-none">

                                    {/* 3.1 Background SVG REMOVED (Moved to Layer 2.5) */}
                                    {/* 3.1 Background SVG REMOVED (Moved to Layer 2.5) */}
                                    {/* Calibration Box REMOVED */}

                                    {elements.map((el) => {
                                        if (el.type === 'text') {
                                            // If this element is currently being edited in the overlay found below, hide it here (opacity 0 to keep layout if needed, or null)
                                            // We use null to prevent duplicate rendering
                                            if (activeTextInput && activeTextInput.id === el.id) return null;

                                            return (
                                                <DraggableNode
                                                    key={`${el.id}-${el.x}-${el.y}`}
                                                    element={el}
                                                    scaleSv={scale}
                                                    onLayout={(layout) => {
                                                        // Only update if dimensions changed significantly to avoid loops
                                                        const wDiff = Math.abs((el.width || 0) - layout.width);
                                                        const hDiff = Math.abs((el.height || 0) - layout.height);
                                                        if (wDiff > 1 || hDiff > 1) {
                                                            const newWidth = layout.width;
                                                            const newHeight = layout.height;
                                                            setElements(prev => prev.map(e => e.id === el.id ? { ...e, width: newWidth, height: newHeight } : e));
                                                        }
                                                    }}
                                                    onTap={() => {
                                                        if (currentTool !== 'arrow') {
                                                            console.log('Starting Edit', el.id);
                                                            setActiveTextInput({ id: el.id, x: el.x || 0, y: el.y || 0, text: '', scale: scale.value });
                                                        }
                                                    }}
                                                    onDragEnd={(id, x, y) => {
                                                        setElements(prev => prev.map(e => e.id === id ? { ...e, x, y } : e));
                                                    }}
                                                >
                                                    {/* Show Anchors if Arrow Tool Active */}
                                                    <AnchorPoints
                                                        nodeWidth={el.width || (150 * 1)}
                                                        nodeHeight={el.height || 100}
                                                        scale={scale.value}
                                                        visible={currentTool === 'arrow'}
                                                        onAnchorSelect={(anchor) => handleArrowAnchorSelect(el.id, anchor)}
                                                        highlightedAnchor={arrowDrawState.sourceNodeId === el.id ? (arrowDrawState.sourceAnchor || undefined) : undefined}
                                                    />
                                                </DraggableNode>
                                            );
                                        }
                                        return null;
                                    })}
                                    {/* Arrow Toolbar moved to Layer 4 (overlay) for proper z-indexing */}
                                </Animated.View>

                                {/* LAYER 3.5: Arrow Toolbar (canvas coords, high z-index, camera-transformed) */}
                                {selectedArrowId && (
                                    <Animated.View style={[
                                        { position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'visible', zIndex: 50 },
                                        cameraStyle
                                    ]} pointerEvents="box-none">
                                        <ArrowToolbarWrapper
                                            selectedArrowId={selectedArrowId}
                                            arrows={arrows}
                                            elements={elements}
                                            setArrows={setArrows}
                                            setSelectedArrowId={setSelectedArrowId}
                                        />
                                    </Animated.View>
                                )}
                            </View>
                        </GestureDetector>

                        {/* LAYER 4: Editor Overlay (Active Input - No Transform) */}
                        <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 100 }]} pointerEvents="box-none">
                            {activeTextInput && (() => {
                                const el = elements.find(e => e.id === activeTextInput.id);
                                if (!el) return null;
                                return (
                                    <ActiveOverlayNode
                                        key={el.id}
                                        element={el}
                                        scaleSv={scale}
                                        translateX={translateX}
                                        translateY={translateY}
                                        initialScale={activeTextInput.scale || 1}
                                        onUpdate={(updatedBlocks) => {
                                            activeContentRef.current = updatedBlocks; // Sync to Ref immediately
                                            const newElements = elements.map(e => e.id === el.id ? { ...e, blocks: updatedBlocks, text: updatedBlocks.map(b => b.text).join('\n'), isNew: false } : e);
                                            setElements(newElements);
                                            pageRef.current = { ...pageRef.current!, contentJson: JSON.stringify(newElements) };
                                        }}
                                        onDelete={() => {
                                            const newElements = elements.filter(e => e.id !== el.id);
                                            setElements(newElements);
                                            setActiveTextInput(null);
                                            pageRef.current = { ...pageRef.current!, contentJson: JSON.stringify(newElements) };
                                        }}
                                        onDragEnd={(id, x, y) => {
                                            const newElements = elements.map(e => e.id === id ? { ...e, x, y } : e);
                                            setElements(newElements);
                                            setActiveTextInput(prev => prev ? { ...prev, x, y } : null);
                                            pageRef.current = { ...pageRef.current!, contentJson: JSON.stringify(newElements) };
                                            runOnJS(addToHistory)();
                                        }}
                                        onClose={() => setActiveTextInput(null)}
                                        onColorChange={(color) => {
                                            const newElements = elements.map(e => e.id === el.id ? { ...e, backgroundColor: color } : e);
                                            setElements(newElements);
                                            pageRef.current = { ...pageRef.current!, contentJson: JSON.stringify(newElements) };
                                            addToHistory();
                                        }}
                                    />
                                );
                            })()}

                            {/* Arrow Toolbar moved to Layer 3.5 (camera-transformed) */}
                        </Animated.View>

                        {/* Scrollbars */}
                        <Animated.View style={[vScrollStyle, { zIndex: 10 }]} pointerEvents="none" />
                        <Animated.View style={[hScrollStyle, { zIndex: 10 }]} pointerEvents="none" />
                    </View>

                    {/* Render Comments Modal */}
                    <CommentsModal
                        visible={isCommentsVisible}
                        onClose={() => setCommentsVisible(false)}
                        threadId={id as string}
                        userRole={userProfile?.role || 'student'}
                        allowedChannels={
                            ['teacher_student', ...(userProfile?.role === 'student' && (userProfile as StudentProfile).linkedParents?.length ? ['parent_student' as const] : [])]
                        }
                    />

                    {/* Overlay Prompt for Read Only Mode */}
                    {!isEditing && (
                        <View style={[styles.overlay, { pointerEvents: 'none', backgroundColor: 'transparent' }]}>
                        </View>
                    )}

                    {/* Toolbar (Only visible when editing) */}
                    {isEditing && (
                        <View style={styles.toolbarContainer}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.toolbarWrapper}
                                contentContainerStyle={styles.toolbarContent}
                            >
                                <RNTouchableOpacity onPress={() => setCurrentTool('drag')} style={[styles.toolBtn, currentTool === 'drag' && styles.activeTool]}>
                                    <MaterialCommunityIcons name="hand-back-right-outline" size={24} color={currentTool === 'drag' ? '#4CAF50' : '#333'} />
                                </RNTouchableOpacity>

                                <RNTouchableOpacity onPress={() => setCurrentTool('text')} style={[styles.toolBtn, currentTool === 'text' && styles.activeTool]}>
                                    <MaterialCommunityIcons name="format-text" size={24} color={currentTool === 'text' ? '#4CAF50' : '#333'} />
                                </RNTouchableOpacity>

                                <Pressable
                                    onPress={() => {
                                        console.log('Arrow Tool Pressed!');
                                        setCurrentTool('arrow');
                                    }}
                                    style={({ pressed }) => [
                                        styles.toolBtn,
                                        currentTool === 'arrow' && styles.activeTool,
                                        pressed && { opacity: 0.5 }
                                    ]}
                                >
                                    <MaterialCommunityIcons name="vector-line" size={24} color={currentTool === 'arrow' ? '#4CAF50' : '#333'} />
                                </Pressable>

                                <View style={styles.divider} />

                                <RNTouchableOpacity onPress={handleUndo} style={styles.toolBtn} disabled={history.length === 0}>
                                    <MaterialCommunityIcons name="undo" size={24} color={history.length === 0 ? '#ccc' : 'black'} />
                                </RNTouchableOpacity>
                                <RNTouchableOpacity onPress={handleRedo} style={styles.toolBtn} disabled={redoStack.length === 0}>
                                    <MaterialCommunityIcons name="redo" size={24} color={redoStack.length === 0 ? '#ccc' : 'black'} />
                                </RNTouchableOpacity>

                                <View style={styles.divider} />

                                <RNTouchableOpacity onPress={handleClearPage} style={styles.toolBtn}>
                                    <MaterialCommunityIcons name="delete-outline" size={24} color="#F44336" />
                                </RNTouchableOpacity>

                                <View style={styles.divider} />

                                <RNTouchableOpacity onPress={() => setShowSettingsMenu(!showSettingsMenu)} style={[styles.toolBtn, showSettingsMenu && styles.activeTool]}>
                                    <MaterialCommunityIcons name="cog" size={24} color="black" />
                                </RNTouchableOpacity>
                            </ScrollView>

                            {/* Settings Menu Popup */}
                            {showSettingsMenu && (
                                <View style={{ position: 'absolute', bottom: 70, right: 10, backgroundColor: 'white', borderRadius: 8, elevation: 5, padding: 10, width: 200, zIndex: 100 }}>
                                    <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>Retention Target</Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                                        {[0.95, 0.9, 0.85, 0.8].map(r => (
                                            <TouchableOpacity
                                                key={r}
                                                style={{
                                                    padding: 8,
                                                    backgroundColor: (page?.retentionTarget || 0.9) === r ? '#4CAF50' : '#f0f0f0',
                                                    borderRadius: 5
                                                }}
                                                onPress={() => handleUpdateRetention(r)}
                                            >
                                                <Text style={{ color: (page?.retentionTarget || 0.9) === r ? 'white' : 'black', fontSize: 12 }}>{Math.round(r * 100)}%</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Analytics Modal */}
                    {page && (
                        <AnalyticsModal
                            visible={isAnalyticsVisible}
                            onClose={() => setAnalyticsVisible(false)}
                            page={page}
                        />
                    )}

                    {/* Review Modal - SIMULATED */}
                    {isReviewModalVisible && (
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: 'black' }}>Session Complete!</Text>
                                    <TouchableOpacity onPress={handleCloseReview} style={{ padding: 5 }}>
                                        <MaterialCommunityIcons name="close" size={24} color="#666" />
                                    </TouchableOpacity>
                                </View>

                                <Text style={{ fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center' }}>How well did you remember this topic?</Text>

                                <View style={styles.retentionContainer}>
                                    {[0.95, 0.9, 0.85, 0.8].map(r => (
                                        <Pressable
                                            key={r}
                                            style={[styles.retentionBtn, pendingRetention === r && styles.activeRetentionBtn]}
                                            onPress={() => setPendingRetention(r)}
                                        >
                                            <Text style={[styles.retentionText, pendingRetention === r && styles.activeRetentionText]}>
                                                {r * 100}% Retention
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>

                                <Text style={styles.label}>Rate your recall:</Text>
                                <View style={styles.buttonsGrid}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                                        // Gradient Logic: 1 (Red/Hard) -> 10 (Green/Easy)
                                        // Interpolate Hue: Red (0) -> Green (120)
                                        const hue = ((num - 1) / 9) * 120; // 0 to 120
                                        const backgroundColor = `hsl(${hue}, 80%, 60%)`;

                                        return (
                                            <Pressable
                                                key={num}
                                                style={({ pressed }) => [
                                                    styles.ratingBtn,
                                                    {
                                                        backgroundColor: pressed ? '#ddd' : backgroundColor,
                                                        borderColor: pressed ? '#333' : 'transparent',
                                                        borderWidth: 1
                                                    }
                                                ]}
                                                onPress={() => submitReview(num)}
                                            >
                                                <Text style={[styles.ratingText, { color: 'white', fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2 }]}>{num}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Plan Time Modal for teacher-assigned pages - SIMULATED MODAL */}
                    {isPlanTimeModalVisible && (
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', color: 'black' }}>Set Learning Time</Text>
                                <Text style={{ fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center' }}>
                                    How many minutes do you plan to spend on this topic?
                                </Text>

                                <TextInput
                                    style={{
                                        backgroundColor: '#f5f5f5',
                                        padding: 15,
                                        borderRadius: 10,
                                        fontSize: 18,
                                        color: 'black',
                                        marginBottom: 20,
                                        borderWidth: 1,
                                        borderColor: '#ddd'
                                    }}
                                    placeholder="Enter minutes"
                                    placeholderTextColor="#999"
                                    keyboardType="numeric"
                                    value={pendingPlannedTime}
                                    onChangeText={setPendingPlannedTime}
                                />

                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                                    <Pressable
                                        style={({ pressed }) => ({
                                            paddingVertical: 12,
                                            paddingHorizontal: 20,
                                            borderRadius: 8,
                                            backgroundColor: '#f0f0f0',
                                            flex: 1,
                                            marginRight: 10,
                                            opacity: pressed ? 0.7 : 1,
                                            justifyContent: 'center',
                                            alignItems: 'center'
                                        })}
                                        onPress={() => handleSavePlannedTimeAndStart(false)}
                                    >
                                        <Text style={{ color: '#666', fontWeight: '600' }}>Save for Later</Text>
                                    </Pressable>
                                    <Pressable
                                        style={({ pressed }) => ({
                                            paddingVertical: 12,
                                            paddingHorizontal: 20,
                                            borderRadius: 8,
                                            backgroundColor: '#4CAF50',
                                            flex: 1,
                                            opacity: pressed ? 0.7 : 1,
                                            justifyContent: 'center',
                                            alignItems: 'center'
                                        })}
                                        onPress={() => handleSavePlannedTimeAndStart(true)}
                                    >
                                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Start Now</Text>
                                    </Pressable>
                                </View>

                                <Pressable
                                    style={({ pressed }) => ({
                                        padding: 10,
                                        alignItems: 'center',
                                        opacity: pressed ? 0.7 : 1
                                    })}
                                    onPress={() => {
                                        setPlanTimeModalVisible(false);
                                        setPendingPlannedTime('');
                                    }}
                                >
                                    <Text style={{ color: '#999' }}>Cancel</Text>
                                </Pressable>
                            </View>
                        </View>
                    )}
                </View>
            </View >
            <CustomAlert
                visible={alertState.visible}
                title={alertState.title}
                message={alertState.message}
                onClose={() => setAlertState(prev => ({ ...prev, visible: false }))}
                buttons={alertState.buttons}
            />
        </View >
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#121212' },
    container: { flex: 1, backgroundColor: 'white' },
    headerTitle: { alignItems: 'center' },
    title: { fontSize: 16, fontWeight: 'bold' },
    timer: { fontSize: 12, color: 'red' },
    timerBtn: { paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20 },
    startBtn: { backgroundColor: '#4CAF50' },
    stopBtn: { backgroundColor: '#f44336' },
    timerBtnText: { color: 'white', fontWeight: 'bold' },

    // Canvas Layer takes full space but sits behind toolbar (zIndex 1)
    // Canvas Layer takes full space but sits behind toolbar (zIndex 1)
    // MUST BE ABSOLUTE to allow "left: -1000" to actually position it outside the viewport
    canvasLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', zIndex: 1 },

    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    overlayText: { fontSize: 20, color: '#666' },

    // Toolbar sits on top (zIndex 20)
    toolbarContainer: { position: 'absolute', bottom: 10, left: 10, right: 10, alignItems: 'center', zIndex: 20 },

    toolbarWrapper: {
        backgroundColor: '#eee',
        borderRadius: 15,
        elevation: 5,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        // maxHeight helps keep it contained
        maxHeight: 60
    },
    // Flex/Layout properties go here
    toolbarContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        gap: 10
    },
    toolBtn: { padding: 5, borderRadius: 5 },
    activeTool: { backgroundColor: '#ddd' },
    divider: { width: 1, height: 24, backgroundColor: '#ccc' },
    colorBtn: { width: 24, height: 24, borderRadius: 12, marginRight: 8, borderColor: '#fff' },

    shapeMenu: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: 'white', padding: 10, borderRadius: 10, marginBottom: 10, elevation: 5, gap: 10 },
    shapeOption: { padding: 5, borderWidth: 1, borderColor: '#eee', borderRadius: 5 },

    modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
    modalContent: { backgroundColor: 'white', width: '90%', padding: 25, borderRadius: 16 },
    modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
    modalSubtitle: { fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center' },
    buttonsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    ratingBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
    ratingText: { fontWeight: 'bold' },

    label: { fontSize: 16, fontWeight: 'bold', marginTop: 20, marginBottom: 10, alignSelf: 'center', color: 'black' },

    retentionContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 20 },
    retentionBtn: { backgroundColor: '#f5f5f5', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, minWidth: '40%', alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
    activeRetentionBtn: { backgroundColor: '#35c128', borderColor: '#35c128' },
    retentionText: { fontSize: 14, fontWeight: 'bold', color: '#666' },
    activeRetentionText: { color: 'white' },
});



