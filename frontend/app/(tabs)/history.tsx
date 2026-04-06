import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../src/services/api';

interface HistoryEntry {
  riddle_question: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  points_earned: number;
  answered_at: string;
}

export default function History() {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await api.get('/history');
      setHistory(response.data);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = ({ item }: { item: HistoryEntry }) => (
    <View style={[styles.historyItem, item.is_correct ? styles.correctItem : styles.wrongItem]}>
      <View style={styles.itemHeader}>
        <View style={styles.statusBadge}>
          <Ionicons
            name={item.is_correct ? 'checkmark-circle' : 'close-circle'}
            size={20}
            color={item.is_correct ? '#4ade80' : '#ef4444'}
          />
          <Text style={[styles.statusText, { color: item.is_correct ? '#4ade80' : '#ef4444' }]}>
            {item.is_correct ? 'Correct' : 'Incorrect'}
          </Text>
        </View>
        {item.is_correct && (
          <View style={styles.pointsBadge}>
            <Ionicons name="star" size={14} color="#fbbf24" />
            <Text style={styles.pointsText}>+{item.points_earned}</Text>
          </View>
        )}
      </View>

      <Text style={styles.questionText} numberOfLines={2}>
        {item.riddle_question}
      </Text>

      <View style={styles.answersContainer}>
        <View style={styles.answerRow}>
          <Text style={styles.answerLabel}>Votre réponse:</Text>
          <Text style={[styles.answerValue, !item.is_correct && styles.wrongAnswer]}>
            {item.user_answer}
          </Text>
        </View>
        {!item.is_correct && (
          <View style={styles.answerRow}>
            <Text style={styles.answerLabel}>Bonne réponse:</Text>
            <Text style={[styles.answerValue, styles.correctAnswer]}>
              {item.correct_answer}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.dateText}>{formatDate(item.answered_at)}</Text>
    </View>
  );

  if (loading) {
    return (
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color="#e94560" />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Ionicons name="time" size={32} color="#e94560" />
        <Text style={styles.title}>Historique</Text>
      </View>

      <FlatList
        data={history}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e94560" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>Aucune énigme résolue</Text>
            <Text style={styles.emptySubtext}>Commencez à jouer pour voir votre historique</Text>
          </View>
        }
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginLeft: 12,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  historyItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 15,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  correctItem: {
    borderColor: 'rgba(74, 222, 128, 0.3)',
    borderLeftColor: '#4ade80',
  },
  wrongItem: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderLeftColor: '#ef4444',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pointsText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  questionText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  answersContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  answerRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  answerLabel: {
    color: '#a0a0a0',
    fontSize: 13,
    marginRight: 8,
  },
  answerValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  wrongAnswer: {
    color: '#ef4444',
  },
  correctAnswer: {
    color: '#4ade80',
  },
  dateText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'right',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: '#666',
    fontSize: 18,
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: '#555',
    fontSize: 14,
    marginTop: 8,
  },
});
