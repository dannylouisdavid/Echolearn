import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Page } from '../types/schema';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

// Charts
import MonthlyTopicChart from './MonthlyTopicChart';
import NotebookTimePieChart from './NotebookTimePieChart';
import ComparisonBarChart from './ComparisonBarChart';
// import MonthlyTimeTrendChart from './MonthlyTimeTrendChart'; // Removed
import WeeklyHistoryChart from './WeeklyHistoryChart';
import CompletionRecordChart from './CompletionRecordChart';

interface AnalyticsDashboardProps {
    pages: Page[];
    notebooks?: any[]; // Notebook[] - using any to avoid circular deps or quick fix, ideally import Notebook
}

export default function AnalyticsDashboard({ pages, notebooks = [] }: AnalyticsDashboardProps) {
    // --- State ---

    // Monthly Topic Chart State
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Time Spent (Pie) Filter State
    const [pieFilter, setPieFilter] = useState<'today' | 'range'>('today');
    const [pieStartDate, setPieStartDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d;
    });
    const [pieEndDate, setPieEndDate] = useState(new Date());
    const [showPieStartPicker, setShowPieStartPicker] = useState(false);
    const [showPieEndPicker, setShowPieEndPicker] = useState(false);

    // --- Data Calculators ---

    const getMonthlyData = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth(); // 0-11

        // Filter filtered completed pages in this month
        const monthlyPages = pages.filter(p => {
            if (!p.isCompleted || !p.completedAt) return false;
            const d = new Date(p.completedAt);
            return d.getFullYear() === year && d.getMonth() === month;
        });

        const dayMap = new Map<number, number>();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 1; i <= daysInMonth; i++) {
            dayMap.set(i, 0);
        }

        monthlyPages.forEach(p => {
            if (p.completedAt) {
                const d = new Date(p.completedAt).getDate();
                dayMap.set(d, (dayMap.get(d) || 0) + 1);
            }
        });

        return Array.from(dayMap.entries())
            .map(([day, count]) => ({ day, value: count }))
            .sort((a, b) => a.day - b.day);
    };

    const getPieData = () => {
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        const notebookMap = new Map<string, number>();

        let startMs: number;
        let endMs: number;

        if (pieFilter === 'today') {
            const now = new Date();
            startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            endMs = startMs + 86400000;
        } else {
            // Range
            startMs = new Date(pieStartDate.getFullYear(), pieStartDate.getMonth(), pieStartDate.getDate()).getTime();
            endMs = new Date(pieEndDate.getFullYear(), pieEndDate.getMonth(), pieEndDate.getDate()).getTime() + 86400000;
        }

        pages.forEach(p => {
            const activeAt = p.completedAt || p.updatedAt || p.createdAt || 0;

            if (activeAt >= startMs && activeAt < endMs) {
                // Resolve Notebook Name
                let nbName = 'Unknown Notebook';
                if (p.notebookId && notebooks.length > 0) {
                    const nb = notebooks.find(n => n.id === p.notebookId);
                    if (nb) nbName = nb.title;
                } else if (p.notebookId) {
                    nbName = p.notebookId; // Fallback to ID if no notebooks passed
                }

                const time = p.actualTimeMinutes || 0;
                if (time > 0) {
                    notebookMap.set(nbName, (notebookMap.get(nbName) || 0) + time);
                }
            }
        });

        return Array.from(notebookMap.entries()).map(([name, value], index) => ({
            name,
            value,
            color: colors[index % colors.length]
        }));
    };

    // --- Handlers ---

    const onChangePieStart = (event: any, selectedDate?: Date) => {
        setShowPieStartPicker(Platform.OS === 'ios');
        if (selectedDate) setPieStartDate(selectedDate);
    };

    const onChangePieEnd = (event: any, selectedDate?: Date) => {
        setShowPieEndPicker(Platform.OS === 'ios');
        if (selectedDate) setPieEndDate(selectedDate);
    };

    return (
        <ScrollView contentContainerStyle={styles.content}>
            {/* 1. Topics Covered */}
            <Text style={styles.subHeader}>Topics Covered</Text>
            <MonthlyTopicChart
                data={getMonthlyData()}
                currentMonth={currentMonth}
                onMonthChange={(dir) => {
                    const newDate = new Date(currentMonth);
                    newDate.setMonth(newDate.getMonth() + dir);
                    setCurrentMonth(newDate);
                }}
            />

            {/* 2. Time Spent Distribution */}
            <Text style={styles.subHeader}>Time Spent Distribution</Text>
            <View style={styles.chartSection}>
                <View style={styles.filterRow}>
                    <View style={styles.toggleContainer}>
                        <TouchableOpacity
                            style={[styles.toggleBtn, pieFilter === 'today' && styles.toggleBtnActive]}
                            onPress={() => setPieFilter('today')}
                        >
                            <Text style={[styles.toggleText, pieFilter === 'today' && styles.toggleTextActive]}>Today</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.toggleBtn, pieFilter === 'range' && styles.toggleBtnActive]}
                            onPress={() => setPieFilter('range')}
                        >
                            <Text style={[styles.toggleText, pieFilter === 'range' && styles.toggleTextActive]}>Range</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {pieFilter === 'range' && (
                    <View style={styles.dateRow}>
                        <TouchableOpacity onPress={() => setShowPieStartPicker(true)} style={styles.dateBtn}>
                            <MaterialCommunityIcons name="calendar" size={16} color="#aaa" />
                            <Text style={styles.dateText}>{pieStartDate.getDate()}/{pieStartDate.getMonth() + 1}/{pieStartDate.getFullYear()}</Text>
                        </TouchableOpacity>
                        <Text style={{ color: '#666' }}>to</Text>
                        <TouchableOpacity onPress={() => setShowPieEndPicker(true)} style={styles.dateBtn}>
                            <MaterialCommunityIcons name="calendar" size={16} color="#aaa" />
                            <Text style={styles.dateText}>{pieEndDate.getDate()}/{pieEndDate.getMonth() + 1}/{pieEndDate.getFullYear()}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {showPieStartPicker && (
                    <DateTimePicker
                        value={pieStartDate}
                        mode="date"
                        display="default"
                        onChange={onChangePieStart}
                        maximumDate={new Date()}
                    />
                )}
                {showPieEndPicker && (
                    <DateTimePicker
                        value={pieEndDate}
                        mode="date"
                        display="default"
                        onChange={onChangePieEnd}
                        maximumDate={new Date()}
                        minimumDate={pieStartDate}
                    />
                )}

                <NotebookTimePieChart data={getPieData()} />
            </View>

            {/* 3. Time Comparison */}
            <Text style={styles.subHeader}>Time Comparison</Text>
            <AnalysisComparisonSection pages={pages} />

            {/* 4. Completion Record */}
            <Text style={styles.subHeader}>Completion Record</Text>
            <CompletionRecordSection pages={pages} />
        </ScrollView>
    );
}

// --- Sub-components (Internal to this Dashboard to allow self-containment) ---

function AnalysisComparisonSection({ pages }: { pages: Page[] }) {
    const [filter, setFilter] = useState<'today' | 'week'>('today');

    const getTodayData = () => {
        const now = new Date();
        const startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endMs = startMs + 86400000;

        let spent = 0;
        let allocated = 0;

        pages.forEach(p => {
            const activeAt = p.completedAt || p.updatedAt || p.createdAt || 0;
            if (activeAt >= startMs && activeAt < endMs) {
                spent += (p.actualTimeMinutes || 0);
                allocated += (p.plannedTimeMinutes || 0);
            }
        });
        return { spent, allocated };
    };

    // Helper to get last 7 days data
    const getWeeklyData = () => {
        const days = [];
        const now = new Date();
        // Go back 6 days + today
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const startMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            const endMs = startMs + 86400000;

            let spent = 0;
            let allocated = 0;

            pages.forEach(p => {
                const activeAt = p.completedAt || p.updatedAt || p.createdAt || 0;
                if (activeAt >= startMs && activeAt < endMs) {
                    spent += (p.actualTimeMinutes || 0);
                    allocated += (p.plannedTimeMinutes || 0);
                }
            });

            // Day label: Short name (e.g. "Mon")
            const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const label = dayNames[d.getDay()];

            days.push({ day: label, spent, allocated });
        }
        return days;
    };

    const label = filter === 'today' ? 'Today' : 'Last 7 Days';

    return (
        <View style={styles.chartSection}>
            <View style={styles.filterRow}>
                <View style={styles.toggleContainer}>
                    <TouchableOpacity
                        style={[styles.toggleBtn, filter === 'today' && styles.toggleBtnActive]}
                        onPress={() => setFilter('today')}
                    >
                        <Text style={[styles.toggleText, filter === 'today' && styles.toggleTextActive]}>Today</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleBtn, filter === 'week' && styles.toggleBtnActive]}
                        onPress={() => setFilter('week')}
                    >
                        <Text style={[styles.toggleText, filter === 'week' && styles.toggleTextActive]}>Week</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {filter === 'week' ? (
                <WeeklyHistoryChart data={getWeeklyData()} />
            ) : (
                <ComparisonBarChart {...getTodayData()} label={label} />
            )}
        </View>
    );
}

function CompletionRecordSection({ pages }: { pages: Page[] }) {
    const [filter, setFilter] = useState<'today' | 'range'>('today');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d;
    });
    const [endDate, setEndDate] = useState(new Date());
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const getData = () => {
        let startMs: number;
        let endMs: number;

        if (filter === 'today') {
            const now = new Date();
            startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            endMs = startMs + 86400000;
        } else {
            // Range
            startMs = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
            endMs = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime() + 86400000;
        }

        let tooFast = 0; // < 80%
        let onTime = 0;  // 80% - 120%
        let overtime = 0; // > 120%

        pages.forEach(p => {
            const activeAt = p.completedAt || p.updatedAt || p.createdAt || 0;
            if (activeAt < startMs || activeAt >= endMs) return;

            // Only count completed pages with valid time data
            if (!p.completedAt || !p.plannedTimeMinutes || !p.actualTimeMinutes) return;

            const ratio = p.actualTimeMinutes / p.plannedTimeMinutes;

            if (ratio < 0.8) {
                tooFast++;
            } else if (ratio > 1.2) {
                overtime++;
            } else {
                onTime++;
            }
        });

        return { tooFast, onTime, overtime };
    };

    const onChangeStart = (event: any, selectedDate?: Date) => {
        setShowStartPicker(Platform.OS === 'ios');
        if (selectedDate) setStartDate(selectedDate);
    };

    const onChangeEnd = (event: any, selectedDate?: Date) => {
        setShowEndPicker(Platform.OS === 'ios');
        if (selectedDate) setEndDate(selectedDate);
    };

    return (
        <View style={styles.chartSection}>
            <View style={styles.filterRow}>
                <View style={styles.toggleContainer}>
                    <TouchableOpacity
                        style={[styles.toggleBtn, filter === 'today' && styles.toggleBtnActive]}
                        onPress={() => setFilter('today')}
                    >
                        <Text style={[styles.toggleText, filter === 'today' && styles.toggleTextActive]}>Today</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleBtn, filter === 'range' && styles.toggleBtnActive]}
                        onPress={() => setFilter('range')}
                    >
                        <Text style={[styles.toggleText, filter === 'range' && styles.toggleTextActive]}>Range</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {filter === 'range' && (
                <View style={styles.dateRow}>
                    <TouchableOpacity onPress={() => setShowStartPicker(true)} style={styles.dateBtn}>
                        <MaterialCommunityIcons name="calendar" size={16} color="#aaa" />
                        <Text style={styles.dateText}>{startDate.getDate()}/{startDate.getMonth() + 1}/{startDate.getFullYear()}</Text>
                    </TouchableOpacity>
                    <Text style={{ color: '#666' }}>to</Text>
                    <TouchableOpacity onPress={() => setShowEndPicker(true)} style={styles.dateBtn}>
                        <MaterialCommunityIcons name="calendar" size={16} color="#aaa" />
                        <Text style={styles.dateText}>{endDate.getDate()}/{endDate.getMonth() + 1}/{endDate.getFullYear()}</Text>
                    </TouchableOpacity>
                </View>
            )}

            {showStartPicker && (
                <DateTimePicker
                    value={startDate}
                    mode="date"
                    display="default"
                    onChange={onChangeStart}
                    maximumDate={new Date()}
                />
            )}
            {showEndPicker && (
                <DateTimePicker
                    value={endDate}
                    mode="date"
                    display="default"
                    onChange={onChangeEnd}
                    maximumDate={new Date()}
                    minimumDate={startDate}
                />
            )}

            <CompletionRecordChart data={getData()} />
        </View>
    );
}

const styles = StyleSheet.create({
    content: { padding: 20 },
    subHeader: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginTop: 30 },
    chartSection: { marginTop: 10 },
    filterRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
    toggleContainer: { flexDirection: 'row', backgroundColor: '#333', borderRadius: 20, padding: 2 },
    toggleBtn: { paddingHorizontal: 20, paddingVertical: 6, borderRadius: 18 },
    toggleBtnActive: { backgroundColor: '#2E7D32' },
    toggleText: { color: '#aaa', fontWeight: 'bold', fontSize: 13 },
    toggleTextActive: { color: 'white' },
    dateRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 15 },
    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    dateText: { color: 'white', fontSize: 13 },
});
