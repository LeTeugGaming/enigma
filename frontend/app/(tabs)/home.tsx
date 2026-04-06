import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api';

interface Riddle {
  id: string;
  question: string;
  hint: string;
  difficulty: string;
  points: number;
  expires_at: string;
  already_answered: boolean;
  user_was_correct: boolean | null;
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [riddle, setRiddle] = useState<Riddle | null>(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<{
    is_correct: boolean;
    correct_answer: string;
    message: string;
  } | null>(null);

  const fetchRiddle = useCallback(async () => {
    try {
      const response = await api.get('/riddles/current');
      setRiddle(response.data);
      setResult(null);
      setAnswer('');
      setShowHint(false);
      
      // Calculate time left
      const expiresAt = new Date(response.data.expires_at).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeLeft(remaining);
    } catch (error: any) {
      console.error('Error fetching riddle:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRiddle();
  }, []);

  // Countdown timer - runs every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) {
          return 0;
        }
        if (prev === 1) {
          // Time just expired, fetch new riddle
          setTimeout(() => fetchRiddle(), 1000);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async () => {
    if (!answer.trim() || !riddle) return;

    setSubmitting(true);
    try {
      const response = await api.post('/riddles/answer', {
        riddle_id: riddle.id,
        answer: answer.trim(),
      });
      
      setResult(response.data);
      await refreshUser();
      
      // Update riddle state to show it was answered
      setRiddle(prev => prev ? { ...prev, already_answered: true, user_was_correct: response.data.is_correct } : null);
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.detail || 'Erreur lors de la soumission');
    } finally {
      setSubmitting(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'facile': return '#4ade80';
      case 'moyen': return '#fbbf24';
      case 'difficile': return '#ef4444';
      default: return '#a0a0a0';
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchRiddle();
  };

  if (loading) {
    return (
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color="#e94560" />
          <Text style={styles.loadingText}>Chargement de l'énigme...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e94560" />
        }
      >
        {/* Header with score */}
        <View style={styles.header}>
          <View style={styles.scoreContainer}>
            <Ionicons name="star" size={20} color="#fbbf24" />
            <Text style={styles.scoreText}>{user?.score || 0} pts</Text>
          </View>
          <View style={styles.timerContainer}>
            <Ionicons name="time" size={20} color="#e94560" />
            <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
          </View>
        </View>

        {/* Riddle Card */}
        <View style={styles.riddleCard}>
          <View style={styles.riddleHeader}>
            <Text style={styles.riddleLabel}>ÉNIGME DU MOMENT</Text>
            <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(riddle?.difficulty || 'moyen') }]}>
              <Text style={styles.difficultyText}>{riddle?.difficulty || 'moyen'}</Text>
            </View>
          </View>

          <Text style={styles.riddleQuestion}>{riddle?.question}</Text>

          <View style={styles.pointsContainer}>
            <Ionicons name="diamond" size={16} color="#e94560" />
            <Text style={styles.pointsText}>{riddle?.points || 0} points</Text>
          </View>

          {/* Hint Section */}
          {!riddle?.already_answered && (
            <TouchableOpacity
              style={styles.hintButton}
              onPress={() => setShowHint(!showHint)}
            >
              <Ionicons name={showHint ? 'eye-off' : 'eye'} size={18} color="#a0a0a0" />
              <Text style={styles.hintButtonText}>
                {showHint ? 'Cacher l\'indice' : 'Voir l\'indice'}
              </Text>
            </TouchableOpacity>
          )}

          {showHint && riddle?.hint && (
            <View style={styles.hintBox}>
              <Ionicons name="bulb" size={18} color="#fbbf24" />
              <Text style={styles.hintText}>{riddle.hint}</Text>
            </View>
          )}
        </View>

        {/* Answer Section */}
        {riddle?.already_answered ? (
          <View style={styles.answeredContainer}>
            {result ? (
              <View style={[styles.resultCard, result.is_correct ? styles.resultCorrect : styles.resultWrong]}>
                <Ionicons
                  name={result.is_correct ? 'checkmark-circle' : 'close-circle'}
                  size={48}
                  color={result.is_correct ? '#4ade80' : '#ef4444'}
                />
                <Text style={styles.resultMessage}>{result.message}</Text>
                {!result.is_correct && (
                  <Text style={styles.correctAnswerText}>Réponse: {result.correct_answer}</Text>
                )}
              </View>
            ) : (
              <View style={styles.alreadyAnsweredCard}>
                <Ionicons
                  name={riddle.user_was_correct ? 'checkmark-circle' : 'close-circle'}
                  size={48}
                  color={riddle.user_was_correct ? '#4ade80' : '#ef4444'}
                />
                <Text style={styles.alreadyAnsweredText}>
                  {riddle.user_was_correct
                    ? 'Vous avez déjà trouvé cette énigme !'
                    : 'Vous avez déjà répondu à cette énigme'}
                </Text>
              </View>
            )}
            <Text style={styles.nextRiddleText}>Prochaine énigme dans {formatTime(timeLeft)}</Text>
          </View>
        ) : (
          <View style={styles.answerSection}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Votre réponse..."
                placeholderTextColor="#666"
                value={answer}
                onChangeText={setAnswer}
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, (!answer.trim() || submitting) && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!answer.trim() || submitting}
            >
              <LinearGradient
                colors={answer.trim() && !submitting ? ['#e94560', '#ff6b6b'] : ['#444', '#333']}
                style={styles.submitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={20} color="#fff" />
                    <Text style={styles.submitText}>Valider</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#a0a0a0',
    marginTop: 10,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scoreText: {
    color: '#fbbf24',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timerText: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  riddleCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  riddleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  riddleLabel: {
    color: '#a0a0a0',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  difficultyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  difficultyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  riddleQuestion: {
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 30,
    marginBottom: 16,
  },
  pointsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointsText: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  hintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
  },
  hintButtonText: {
    color: '#a0a0a0',
    marginLeft: 8,
    fontSize: 14,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#fbbf24',
  },
  hintText: {
    color: '#fbbf24',
    marginLeft: 8,
    fontSize: 14,
    flex: 1,
  },
  answerSection: {
    marginTop: 10,
  },
  inputContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  input: {
    height: 55,
    paddingHorizontal: 20,
    color: '#ffffff',
    fontSize: 16,
  },
  submitButton: {
    borderRadius: 15,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  answeredContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  resultCard: {
    width: '100%',
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  resultCorrect: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  resultWrong: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  resultMessage: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  correctAnswerText: {
    color: '#a0a0a0',
    fontSize: 14,
    marginTop: 8,
  },
  alreadyAnsweredCard: {
    width: '100%',
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  alreadyAnsweredText: {
    color: '#a0a0a0',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  nextRiddleText: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
  },
});
