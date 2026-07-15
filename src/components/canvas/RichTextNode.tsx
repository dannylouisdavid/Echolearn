import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface RichTextBlock {
    id: string;
    type: 'heading' | 'subheading' | 'paragraph' | 'bullet' | 'number';
    text: string;
    styles?: {
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        color?: string;
    };
}

export interface RichTextNodeProps {
    id: string;
    initialBlocks?: RichTextBlock[];
    color: string;
    isSelected: boolean;
    autoFocus?: boolean;
    scale?: number;
    pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
    onUpdate: (blocks: RichTextBlock[]) => void;
    onDelete?: () => void;
    onClose?: () => void;
    backgroundColor?: string;
    onColorChange?: (color: string) => void;
    onLayout?: (layout: { width: number; height: number }) => void;
}

interface BlockInputProps {
    block: RichTextBlock;
    index: number;
    listNumber?: number;
    inputRef: (ref: TextInput | null) => void;
    onUpdate: (id: string, text: string) => void;
    onKeyPress: (e: any, index: number, selection?: { start: number; end: number }) => void;
    onFocus: (id: string) => void;
    scale: number;
    placeholder?: string;
    initialSelection?: { start: number; end: number };
}

const BlockInput = React.memo(({ block, index, listNumber, inputRef, onUpdate, onKeyPress, onFocus, scale, placeholder, initialSelection }: BlockInputProps) => {
    // Local text state with sync to parent
    const [localText, setLocalText] = useState(block.text);
    const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(initialSelection);
    const currentSelection = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

    // Sync local text with block.text when it changes externally
    useEffect(() => {
        setLocalText(block.text);
    }, [block.id, block.text]);

    // Apply selection when initialSelection is provided (for new blocks or merge operations)
    useEffect(() => {
        if (initialSelection) {
            setSelection(initialSelection);
            currentSelection.current = initialSelection;
            // Clear controlled selection after a brief moment to allow free typing
            setTimeout(() => setSelection(undefined), 100);
        }
    }, [initialSelection?.start, initialSelection?.end]);

    const handleChangeText = (t: string) => {
        // Check if Enter was pressed (newline in text)
        const hasNewline = t.includes('\n') || t.includes('\r');
        if (hasNewline) {
            // On split, update local text to first part only (before newline)
            const parts = t.split(/\r?\n|\r/);
            setLocalText(parts[0]);
        } else {
            setLocalText(t);
        }
        // Pass full text to parent for handling
        onUpdate(block.id, t);
    };

    const baseSize = block.type === 'heading' ? 24 : block.type === 'subheading' ? 18 : 16;
    const fontSize = baseSize * scale;
    const lineHeight = fontSize * 1.5;

    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', width: '100%' }}>
            {(block.type === 'bullet' || block.type === 'number') && (
                <Text style={{ marginRight: 5 * scale, fontSize, lineHeight }}>{block.type === 'bullet' ? '\u2022' : `${listNumber || 1}.`}</Text>
            )}
            <TextInput
                ref={inputRef}
                style={[
                    styles.inputIndex,
                    block.styles?.bold && { fontWeight: 'bold' },
                    block.styles?.italic && { fontStyle: 'italic' },
                    { fontSize, lineHeight, minHeight: 24 * scale, textAlignVertical: 'top', paddingTop: 0, paddingBottom: 0 }
                ]}
                value={localText}
                multiline
                blurOnSubmit={false}
                placeholder={placeholder}
                selection={selection}
                onSelectionChange={(e) => {
                    currentSelection.current = e.nativeEvent.selection;
                    // Clear controlled selection after it's been applied
                    if (selection) {
                        setTimeout(() => setSelection(undefined), 50);
                    }
                }}
                onChangeText={handleChangeText}
                onKeyPress={(e) => onKeyPress(e, index, currentSelection.current)}
                onFocus={() => onFocus(block.id)}
            />
        </View>
    );
});

export const RichTextNode: React.FC<RichTextNodeProps> = ({ id, initialBlocks, color, isSelected, autoFocus, scale = 1, pointerEvents, onUpdate, onDelete, onClose, backgroundColor = 'rgba(255, 255, 255, 0.9)', onColorChange, onLayout }) => {
    const [blocks, setBlocks] = useState<RichTextBlock[]>(initialBlocks || [{ id: '1', type: 'heading', text: '' }]);
    const [isEditing, setIsEditing] = useState(!!autoFocus);
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const inputRefs = useRef<{ [key: string]: TextInput | null }>({});

    const [history, setHistory] = useState<RichTextBlock[][]>([initialBlocks || [{ id: '1', type: 'heading', text: '' }]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [showColors, setShowColors] = useState(false);
    const [splitVersion, setSplitVersion] = useState(0);

    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;
    const focusCursorAtStart = useRef(false);
    const pendingCursorPosition = useRef<number | null>(null);

    const addToHistory = (newBlocks: RichTextBlock[]) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newBlocks);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const prevBlocks = history[newIndex];
            setBlocks(prevBlocks);
            onUpdateRef.current(prevBlocks);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const nextBlocks = history[newIndex];
            setBlocks(nextBlocks);
            onUpdateRef.current(nextBlocks);
        }
    };

    // Initial Auto-Focus
    useEffect(() => {
        if (autoFocus) {
            setIsEditing(true);
            if (blocks.length > 0) {
                setActiveBlockId(blocks[0].id);
            }
        }
    }, [autoFocus]);

    // Handle Focus Transition
    useEffect(() => {
        if (activeBlockId && isEditing) {
            const attemptFocus = (delay: number) => {
                setTimeout(() => {
                    const ref = inputRefs.current[activeBlockId];
                    if (ref) {
                        ref.focus();
                        if (focusCursorAtStart.current) {
                            ref.setNativeProps({ selection: { start: 0, end: 0 } });
                        }
                    }
                }, delay);
            };

            attemptFocus(50);
            attemptFocus(200);

            // Reset cursor flag after focus attempts
            setTimeout(() => {
                focusCursorAtStart.current = false;
                pendingCursorPosition.current = null;
            }, 300);
        }
    }, [activeBlockId, isEditing]); // Trigger when editing starts or block changes

    useEffect(() => {
        // Sync on mount/update is now handled by handlers synchronously
    }, []);

    const updateBlockType = (type: RichTextBlock['type']) => {
        if (!activeBlockId) return;
        const newBlocks = blocks.map(b => b.id === activeBlockId ? { ...b, type } : b);
        setBlocks(newBlocks);
        addToHistory(newBlocks);
        onUpdateRef.current(newBlocks);
    };

    const toggleStyle = (style: keyof NonNullable<RichTextBlock['styles']>) => {
        if (!activeBlockId) return;
        const newBlocks = blocks.map(b => {
            if (b.id === activeBlockId) {
                const currentStyles = b.styles || {};
                return { ...b, styles: { ...currentStyles, [style]: !currentStyles[style] } };
            }
            return b;
        });
        setBlocks(newBlocks);
        addToHistory(newBlocks);
        onUpdateRef.current(newBlocks);
    };

    const renderEditorToolbar = () => (
        <View style={[styles.toolbar, { flexDirection: 'column', alignItems: 'stretch' }]}>
            {/* Top Row: Actions + Colors */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 4 }}>
                <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={handleUndo} style={[styles.toolBtn, { opacity: historyIndex > 0 ? 1 : 0.3 }]} disabled={historyIndex === 0}>
                        <MaterialCommunityIcons name="undo" size={20} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleRedo} style={[styles.toolBtn, { opacity: historyIndex < history.length - 1 ? 1 : 0.3 }]} disabled={historyIndex === history.length - 1}>
                        <MaterialCommunityIcons name="redo" size={20} />
                    </TouchableOpacity>
                </View>

                {/* Colors - Middle */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: 8, flex: 1 }} contentContainerStyle={{ alignItems: 'center' }}>
                    {['#FFFFFF', '#FFF9C4', '#BBDEFB', '#C8E6C9', '#F8BBD0', '#E1BEE7'].map(c => (
                        <TouchableOpacity
                            key={c}
                            onPress={() => onColorChange?.(c)}
                            style={[
                                styles.toolBtn,
                                {
                                    backgroundColor: c,
                                    borderWidth: 1,
                                    borderColor: backgroundColor === c ? '#000' : '#ccc',
                                    width: 24,
                                    height: 24,
                                    borderRadius: 12,
                                    marginRight: 4,
                                    padding: 0
                                }
                            ]}
                        />
                    ))}
                </ScrollView>

                <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={onDelete} style={[styles.toolBtn, { backgroundColor: '#ffebee' }]}><MaterialCommunityIcons name="delete" size={20} color="red" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => { setIsEditing(false); onClose?.(); }} style={[styles.toolBtn, { backgroundColor: '#e8f5e9', marginLeft: 8 }]}><MaterialCommunityIcons name="check" size={20} color="green" /></TouchableOpacity>
                </View>
            </View>

            {/* Bottom Row: Formatting */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                <TouchableOpacity onPress={() => updateBlockType('heading')} style={styles.toolBtn}><MaterialCommunityIcons name="format-header-1" size={20} /></TouchableOpacity>
                <TouchableOpacity onPress={() => updateBlockType('subheading')} style={styles.toolBtn}><MaterialCommunityIcons name="format-header-2" size={20} /></TouchableOpacity>
                <TouchableOpacity onPress={() => updateBlockType('paragraph')} style={styles.toolBtn}><MaterialCommunityIcons name="format-paragraph" size={20} /></TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity onPress={() => updateBlockType('bullet')} style={styles.toolBtn}><MaterialCommunityIcons name="format-list-bulleted" size={20} /></TouchableOpacity>
                <TouchableOpacity onPress={() => updateBlockType('number')} style={styles.toolBtn}><MaterialCommunityIcons name="format-list-numbered" size={20} /></TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity onPress={() => toggleStyle('bold')} style={styles.toolBtn}><MaterialCommunityIcons name="format-bold" size={20} /></TouchableOpacity>
                <TouchableOpacity onPress={() => toggleStyle('italic')} style={styles.toolBtn}><MaterialCommunityIcons name="format-italic" size={20} /></TouchableOpacity>
            </ScrollView>
        </View>
    );

    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleKeyDown = (e: any, index: number, currentSel?: { start: number; end: number }) => {
        // NOTE: Enter key is handled by handleUpdateText when '\n' appears in text
        // This avoids double-processing on Android
        if (e.nativeEvent.key === 'Backspace' && index > 0) {
            // Check if cursor is at position 0 (start of block)
            const isAtStart = currentSel && currentSel.start === 0 && currentSel.end === 0;
            if (isAtStart || blocks[index].text === '') {
                const currentBlock = blocks[index];

                // If current block is a list item, first convert to paragraph
                if (currentBlock.type === 'bullet' || currentBlock.type === 'number') {
                    const newBlocks = [...blocks];
                    newBlocks[index] = { ...currentBlock, type: 'paragraph' };
                    setBlocks(newBlocks);
                    addToHistory(newBlocks);
                    onUpdateRef.current(newBlocks);
                    return; // Don't merge, just remove list formatting
                }

                // Otherwise merge with previous block
                const prevBlock = blocks[index - 1];
                const mergePoint = prevBlock.text.length; // Cursor position after merge

                const newBlocks = [...blocks];
                // Append current block text to previous block
                newBlocks[index - 1] = { ...prevBlock, text: prevBlock.text + currentBlock.text };
                // Remove current block
                newBlocks.splice(index, 1);

                setBlocks(newBlocks);
                addToHistory(newBlocks);
                onUpdateRef.current(newBlocks);

                // Set pending cursor position for merge point
                pendingCursorPosition.current = mergePoint;
                setTimeout(() => setActiveBlockId(prevBlock.id), 50);
            }
        }
    };

    const handleUpdateText = (id: string, t: string) => {
        // Check for any newline format (\n, \r\n, \r)
        const hasNewline = t.includes('\n') || t.includes('\r');
        if (hasNewline) {
            // Handle Newline -> Split Block (Android Enter behavior)
            const index = blocks.findIndex(b => b.id === id);
            if (index === -1) return;

            const parts = t.split(/\r?\n|\r/);
            const newBlockId = Date.now().toString();
            const currentBlock = blocks[index];

            const newBlocks = [...blocks];
            // Update current block with first part (trimmed)
            newBlocks[index] = { ...newBlocks[index], text: parts[0] };

            // Inherit list type if current block is a list item
            const newType = (currentBlock.type === 'bullet' || currentBlock.type === 'number')
                ? currentBlock.type
                : 'paragraph';
            // Insert new block with remaining parts (filter empty, join, trim to avoid leading newlines)
            const remainingText = parts.slice(1).filter(p => p.length > 0).join('\n').trim();
            const newBlock: RichTextBlock = {
                id: newBlockId,
                type: newType,
                text: remainingText,
            };
            newBlocks.splice(index + 1, 0, newBlock);

            setBlocks(newBlocks);
            addToHistory(newBlocks);
            onUpdateRef.current(newBlocks);

            // Directly set the text value on the original TextInput to prevent desync
            const originalRef = inputRefs.current[id];
            if (originalRef) {
                originalRef.setNativeProps({ text: parts[0] });
            }

            // Focus new block
            focusCursorAtStart.current = true;
            setTimeout(() => setActiveBlockId(newBlockId), 50);

            // Increment splitVersion to force BlockInput remount
            setSplitVersion(v => v + 1);
        } else {
            // Normal update
            const newBlocks = blocks.map(b => b.id === id ? { ...b, text: t } : b);
            setBlocks(newBlocks);
            onUpdateRef.current(newBlocks);

            // Debounced History Save (1s)
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                addToHistory(newBlocks);
            }, 1000);
        }
    };

    if (!isEditing) {
        return (
            <View
                style={[styles.container, isSelected && styles.selected, { borderColor: color, backgroundColor: backgroundColor, padding: 10 * scale, minWidth: 100 * scale, maxWidth: 300 * scale }]}
                pointerEvents={pointerEvents}
                onLayout={(e) => onLayout?.(e.nativeEvent.layout)}
            >
                {blocks.map((b, i) => {
                    const baseSize = b.type === 'heading' ? 24 : b.type === 'subheading' ? 18 : 16;
                    const fontSize = baseSize * scale;
                    // Calculate list number for numbered items
                    const listNumber = b.type === 'number'
                        ? blocks.slice(0, i).filter(prev => prev.type === 'number').length + 1
                        : undefined;
                    return (
                        <Text key={b.id} style={[
                            styles.textBase,
                            b.styles?.bold && { fontWeight: 'bold' },
                            b.styles?.italic && { fontStyle: 'italic' },
                            { color: b.styles?.color || 'black', fontSize, lineHeight: fontSize * 1.5, marginBottom: 4 * scale }
                        ]}>
                            {(b.type === 'bullet' ? '• ' : b.type === 'number' ? `${listNumber}. ` : '') + (b.text || ' ')}
                        </Text>
                    );
                })}
            </View>
        );
    }

    return (
        <View
            style={[styles.container, styles.editing, { borderColor: color, backgroundColor: backgroundColor, padding: 10 * scale, minWidth: 380, maxWidth: undefined }]}
            pointerEvents={pointerEvents}
            onLayout={(e) => onLayout?.(e.nativeEvent.layout)}
        >
            {renderEditorToolbar()}
            {blocks.map((b, i) => {
                // Calculate list number for numbered items
                const listNumber = b.type === 'number'
                    ? blocks.slice(0, i).filter(prev => prev.type === 'number').length + 1
                    : undefined;
                return (
                    <BlockInput
                        key={`${b.id}-${splitVersion}`}
                        block={b}
                        index={i}
                        listNumber={listNumber}
                        inputRef={(ref: TextInput | null) => (inputRefs.current[b.id] = ref)}
                        onUpdate={handleUpdateText}
                        onKeyPress={handleKeyDown}
                        onFocus={setActiveBlockId}
                        scale={scale}
                        placeholder={blocks.length === 1 && i === 0 ? (b.type === 'heading' ? 'Heading' : 'Type...') : undefined}
                        initialSelection={
                            b.id === activeBlockId
                                ? (focusCursorAtStart.current
                                    ? { start: 0, end: 0 }
                                    : (pendingCursorPosition.current !== null
                                        ? { start: pendingCursorPosition.current, end: pendingCursorPosition.current }
                                        : undefined))
                                : undefined
                        }
                    />
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: 8,
        borderWidth: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.9)', // Slight opacity to see grid/bg if needed
        overflow: 'hidden',
    },
    selected: {
        borderWidth: 2,
        backgroundColor: 'white',
        zIndex: 10,
    },
    editing: {
        borderWidth: 2,
        backgroundColor: 'white',
        zIndex: 100, // Pop above everything
        minHeight: 240, // Expanded editor
        minWidth: 380, // Ensure toolbar fits
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 10,
    },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        marginBottom: 8,
    },
    toolBtn: {
        padding: 6,
        marginRight: 4,
        borderRadius: 4,
        backgroundColor: '#f5f5f5',
    },
    divider: {
        width: 1,
        height: 20,
        backgroundColor: '#ccc',
        marginHorizontal: 4,
    },
    textBase: {
        fontFamily: 'System', // Or your app font
    },
    inputIndex: {
        flex: 1,
        padding: 0, // Reset default padding
        margin: 0,
        fontFamily: 'System',
    }
});
