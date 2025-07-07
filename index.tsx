import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext, useReducer } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, GenerateContentResponse, Chat } from "@google/genai";
import { sampleWords } from './src/data/sampleWords'; // Corrected path
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- 토스트 알림 시스템 ---
// 토스트 메시지 타입 정의 - 사용자에게 표시될 알림 메시지의 구조
interface ToastMessage {
    id: number;                    // 고유 식별자
    message: string;               // 표시할 메시지 내용
    type: 'success' | 'error' | 'warning' | 'info';  // 메시지 타입 (성공/오류/경고/정보)
}
// 토스트 컨텍스트 타입 정의 - 토스트 메시지를 추가하는 함수를 제공
interface ToastContextType {
    addToast: (message: string, type: ToastMessage['type']) => void;  // 토스트 메시지 추가 함수
}
const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToasts = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToasts must be used within a ToastProvider');
    }
    return context;
};

const ToastProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const toastIdRef = useRef(0);

    const addToast = useCallback((message: string, type: ToastMessage['type']) => {
        const id = toastIdRef.current++;
        setToasts(prevToasts => [...prevToasts, { id, message, type }]);
        const duration = type === 'error' || type === 'warning' ? 7000 : 5000;
        setTimeout(() => {
            removeToast(id);
        }, duration);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="fixed top-5 right-5 z-[100] w-full max-w-xs sm:max-w-sm space-y-3">
                {toasts.map(toast => (
                    <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => removeToast(toast.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

interface ToastProps {
    message: string;
    type: ToastMessage['type'];
    onClose: () => void;
}
const Toast: React.FC<ToastProps> = React.memo(({ message, type, onClose }) => {
    const [isExiting, setIsExiting] = useState(false);

    const typeStyles = useMemo(() => {
        switch (type) {
            case 'success': return { bg: 'bg-green-500', text: 'text-white', icon: '✔️' };
            case 'error': return { bg: 'bg-red-500', text: 'text-white', icon: '❌' };
            case 'warning': return { bg: 'bg-yellow-500', text: 'text-slate-800', icon: '⚠️' }; // Darker text for yellow
            case 'info': return { bg: 'bg-blue-500', text: 'text-white', icon: 'ℹ️' };
            default: return { bg: 'bg-slate-600', text: 'text-white', icon: '' };
        }
    }, [type]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(onClose, 300); 
    };

    return (
        <div 
            role="alert" 
            aria-live={type === 'error' ? 'assertive' : 'polite'}
            className={`flex items-start justify-between p-4 rounded-md shadow-lg ${typeStyles.bg} ${typeStyles.text} ${isExiting ? 'animate-slideOutRight' : 'animate-slideInRight'}`}
        >
            <div className="flex items-center">
                {typeStyles.icon && <span className="mr-2 text-lg">{typeStyles.icon}</span>}
                <p className="text-sm">{message}</p>
            </div>
            <button onClick={handleClose} aria-label="Close notification" className={`ml-4 p-1 rounded-md hover:bg-black/20 focus:outline-none focus:ring-2 ${type==='warning' ? 'focus:ring-slate-700/50' : 'focus:ring-white/50'} text-xl leading-none`}>&times;</button>
        </div>
    );
});


// --- Global Loading Indicator ---
const GlobalSpinner: React.FC<{ isLoading: boolean }> = ({ isLoading }) => {
    if (!isLoading) return null;
    return (
        <div className="fixed top-4 right-4 z-[200] p-2 bg-slate-200/80 dark:bg-slate-700/80 rounded-full shadow-lg" aria-label="Loading content" role="status">
            <svg className="animate-spin h-6 w-6 text-cyan-600 dark:text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        </div>
    );
};


// Define types for user settings
// 사용자 설정 인터페이스 - 앱의 모든 사용자 설정을 관리
export interface UserSettings {
    grade: string;                    // 학년 (초등학교 1학년, 2학년 등)
    textbook: string;                 // 교과서 이름
    dailyGoal: number;                // 일일 학습 목표 단어 수
    username: string;                 // 사용자 이름
    theme: 'dark' | 'light';          // 테마 설정 (다크/라이트 모드)
    speechRate: number;               // 음성 재생 속도 (0.5 ~ 2.0)
    autoPlayAudio: boolean;           // 자동 음성 재생 여부
    xp: number;                       // 경험치 포인트
    level: number;                    // 현재 레벨
    lastQuizDate?: string;            // 마지막 퀴즈 날짜
    lastQuizScore?: number;           // 마지막 퀴즈 점수
    lastLearnedDate?: string;         // 마지막 학습 날짜
    lastGameDate?: string;            // 마지막 게임 플레이 날짜
    currentStreak?: number;           // 현재 연속 학습 일수
    bestStreak?: number;              // 최고 연속 학습 일수
}


type AppScreen = 'loginSetup' | 'dashboard' | 'learnWords' | 'quiz' | 'allWords' | 'stats' | 'manageWords' | 'tutorChat' | 'gameSelection' | 'wordMatchGame' | 'typingPracticeGame' | 'speedQuizGame' | 'wordShooterGame' | 'wordBombGame' | 'wordZombieDefense' | 'wordPuzzleSlideGame' | 'gameResult';

// 단어 인터페이스 - 학습할 영단어의 모든 정보를 포함
export interface Word { 
    id: number | string;              // 고유 식별자
    term: string;                     // 영단어
    pronunciation?: string;           // 발음 기호 (선택사항)
    partOfSpeech: string;             // 품사 (명사, 동사, 형용사 등)
    meaning: string;                  // 한국어 뜻
    exampleSentence: string;          // 예문
    exampleSentenceMeaning?: string;  // 예문 한국어 번역 (선택사항)
    gradeLevel: string;               // 학년 레벨
    isCustom?: boolean;               // 사용자가 직접 추가한 단어인지 여부
    unit?: string | number;           // 단원/과 번호 (선택사항)
}

// 단어 학습 통계 인터페이스 - 각 단어의 학습 진행 상황을 추적
export interface WordStat { 
    id: number | string;              // 단어 ID (Word 인터페이스의 id와 동일)
    isMastered: boolean;              // 완전히 익혔는지 여부
    lastReviewed: string | null;      // 마지막 복습 날짜 (ISO 문자열)
    quizIncorrectCount: number;       // 퀴즈에서 틀린 횟수
}

// --- 유틸리티 함수들 ---
// 배열을 무작위로 섞는 함수 (Fisher-Yates 알고리즘 사용)
const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];  // 원본 배열을 복사하여 변경하지 않음
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));  // 0부터 i까지의 무작위 인덱스
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];  // 두 요소를 교환
    }
    return newArray;
};

// 음성 합성 관련 전역 변수들
let cachedVoices: SpeechSynthesisVoice[] | null = null;  // 캐시된 음성 목록
let preferredVoices: { [lang: string]: SpeechSynthesisVoice | undefined } = {};  // 언어별 선호 음성
let voicesLoadedPromise: Promise<void> | null = null;  // 음성 로딩 완료 Promise

// 음성 목록을 로드하는 함수 - 브라우저의 음성 합성 기능을 초기화
const loadVoices = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        if (!voicesLoadedPromise) {
            voicesLoadedPromise = new Promise((resolve) => {
                const tryLoad = () => {
                    const voices = speechSynthesis.getVoices();  // 사용 가능한 음성 목록 가져오기
                    if (voices.length > 0) {
                        cachedVoices = voices;  // 음성 목록을 캐시에 저장
                        preferredVoices = {};   // 선호 음성 초기화
                        resolve();
                    }
                };

                if (speechSynthesis.getVoices().length > 0) {
                    tryLoad();  // 이미 음성이 로드되어 있으면 바로 처리
                } else {
                    speechSynthesis.onvoiceschanged = () => {  // 음성 목록이 변경될 때 호출
                        tryLoad();
                        speechSynthesis.onvoiceschanged = null;  // 이벤트 리스너 제거
                    };
                }
            });
        }
        return voicesLoadedPromise;
    }
    return Promise.resolve();  // 브라우저가 음성 합성을 지원하지 않으면 빈 Promise 반환
};

loadVoices();

// 텍스트를 음성으로 재생하는 함수
const speak = async (text: string, lang = 'en-US', rate?: number) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        speechSynthesis.cancel();  // 이전 음성 재생 중단
        const utterance = new SpeechSynthesisUtterance(text);  // 음성 합성 객체 생성
        utterance.lang = lang;  // 언어 설정
        if (rate !== undefined) {
            utterance.rate = Math.max(0.1, Math.min(rate, 10));  // 재생 속도를 유효 범위로 제한 (0.1 ~ 10)
        }


        await loadVoices();  // 음성 목록 로드 완료 대기

        // 해당 언어의 선호 음성이 없으면 선택
        if (cachedVoices && !preferredVoices[lang]) {
            const targetLangVoices = cachedVoices.filter(voice => voice.lang === lang || voice.lang.startsWith(lang.split('-')[0]));
            preferredVoices[lang] = 
                targetLangVoices.find(voice => voice.name.includes('Google') && voice.lang === lang) ||      // Google 음성 우선
                targetLangVoices.find(voice => voice.name.includes('Microsoft') && voice.lang === lang) ||   // Microsoft 음성
                targetLangVoices.find(voice => voice.name.includes('Samantha') && voice.lang === lang) ||    // Samantha 음성 (일반적인 음성명)
                targetLangVoices.find(voice => voice.default && voice.lang === lang) ||                      // 해당 언어의 기본 음성
                targetLangVoices.find(voice => voice.lang === lang) ||                                       // 해당 언어의 첫 번째 음성
                targetLangVoices.find(voice => voice.default) ||                                             // 시스템 기본 음성
                targetLangVoices[0];                                                                         // 첫 번째 사용 가능한 음성
        }

        // 선호 음성 또는 시스템 기본 음성 설정
        if (preferredVoices[lang]) {
            utterance.voice = preferredVoices[lang];  // 선호 음성 사용
        } else if (cachedVoices && cachedVoices.length > 0) {
            const systemDefaultVoice = cachedVoices.find(v => v.default);  // 시스템 기본 음성 찾기
            if (systemDefaultVoice) utterance.voice = systemDefaultVoice;  // 기본 음성 설정
        }
        
        speechSynthesis.speak(utterance);  // 음성 재생 시작
    } else {
        console.warn("Speech synthesis not supported in this browser.");  // 브라우저가 음성 합성을 지원하지 않음
    }
};


// 오늘 날짜를 YYYY-MM-DD 형식의 문자열로 반환
const getTodayDateString = () => new Date().toISOString().split('T')[0];

// 새로운 단어의 기본 통계 객체를 생성
const getDefaultWordStat = (wordId: string | number): WordStat => ({
    id: wordId,                    // 단어 ID
    isMastered: false,             // 아직 익히지 않음
    lastReviewed: null,            // 아직 복습하지 않음
    quizIncorrectCount: 0,         // 퀴즈에서 틀린 횟수 0
});


// --- Gemini API 클라이언트 설정 ---
const apiKey =
  import.meta.env.VITE_API_KEY ||
  import.meta.env.VITE_GEMINI_API_KEY ||
  process.env.API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY;
let ai: GoogleGenAI | null = null;  // Gemini AI 클라이언트 인스턴스
if (apiKey) {
    ai = new GoogleGenAI({ apiKey });  // API 키로 클라이언트 초기화
} else {
    console.warn("API_KEY environment variable not set. AI features will be disabled.");  // API 키가 없으면 AI 기능 비활성화
}

// --- Gemini API 할당량 관리 ---
let isCurrentlyGeminiQuotaExhausted = false;  // 현재 할당량 초과 상태
let quotaCooldownTimeoutId: number | null = null;  // 할당량 쿨다운 타이머 ID
const GEMINI_QUOTA_COOLDOWN_MS = 15 * 60 * 1000;  // 할당량 쿨다운 시간 (15분)

// Gemini API 할당량 초과 시 쿨다운을 설정하는 함수
const setGeminiQuotaExhaustedCooldown = (
    addToastForNotification: (message: string, type: ToastMessage['type']) => void,  // 토스트 알림 함수
    featureName?: string   // 기능 이름 (선택사항)
) => {
    if (!isCurrentlyGeminiQuotaExhausted) {  // 이미 쿨다운 중이 아닐 때만 설정
        const cooldownMinutes = GEMINI_QUOTA_COOLDOWN_MS / 60000;  // 쿨다운 시간을 분 단위로 계산
        console.log(`Gemini API quota exhaustion detected for '${featureName || 'a Gemini API call'}'. Activating ${cooldownMinutes}-minute cooldown.`);
        isCurrentlyGeminiQuotaExhausted = true;  // 할당량 초과 상태로 설정
        
        // 사용자에게 표시할 메시지 생성
        const baseMessage = featureName
            ? `Gemini API 사용량 할당량(quota)을 초과하여 '${featureName}' 기능 사용이 중단됩니다.`
            : `Gemini API 사용량 할당량(quota)을 초과했습니다.`;
        
        addToastForNotification(`${baseMessage} Google AI Studio 또는 Google Cloud Console에서 할당량 및 결제 세부 정보를 확인해주세요. 추가 API 호출이 ${cooldownMinutes}분 동안 중단됩니다.`, "error");
        
        // 기존 타이머가 있으면 제거
        if (quotaCooldownTimeoutId) {
            clearTimeout(quotaCooldownTimeoutId);
        }
        // 새로운 쿨다운 타이머 설정
        quotaCooldownTimeoutId = window.setTimeout(() => {
            isCurrentlyGeminiQuotaExhausted = false;  // 할당량 초과 상태 해제
            quotaCooldownTimeoutId = null;  // 타이머 ID 초기화
            console.log("Gemini API quota cooldown finished. API calls may resume.");
            addToastForNotification(`Gemini API 호출 제한 시간이 종료되었습니다. ${featureName ? `'${featureName}' 기능을 ` : ''}다시 시도할 수 있습니다.`, "info");
        }, GEMINI_QUOTA_COOLDOWN_MS);
    }
};

// Gemini API 오류를 파싱하여 처리 가능한 형태로 변환하는 함수
const parseGeminiError = (error: any): { detailedErrorMessage: string; statusCode?: number; geminiErrorStatus?: string; isQuotaExhaustedError: boolean; isRateLimitErrorForRetry: boolean; displayErrorMsg: string } => {
    let detailedErrorMessage = "";  // 소문자로 변환된 상세 오류 메시지
    let statusCode: number | undefined;  // HTTP 상태 코드
    let geminiErrorStatus: string | undefined;  // Gemini API 오류 상태
    let displayErrorMsg = String(error);  // 사용자에게 표시할 오류 메시지

    // 표준 Gemini API 오류 객체 처리
    if (error && error.error && typeof error.error.message === 'string') {
        detailedErrorMessage = error.error.message.toLowerCase();  // 소문자로 변환하여 검색용
        displayErrorMsg = error.error.message;  // 원본 대소문자 유지하여 표시용
        if (typeof error.error.code === 'number') {
            statusCode = error.error.code;  // HTTP 상태 코드 추출
        }
        if (typeof error.error.status === 'string') {
            geminiErrorStatus = error.error.status.toUpperCase();  // Gemini 오류 상태 추출
        }
    } else if (error && typeof error.message === 'string') {  // 일반 JavaScript Error 객체 처리
        detailedErrorMessage = error.message.toLowerCase();
        displayErrorMsg = error.message;
        if (error.status && typeof error.status === 'number') {
            statusCode = error.status;  // 상태 코드 추출
        }
    } else { 
        detailedErrorMessage = String(error).toLowerCase();  // 기타 오류 객체 처리
    }

    // 할당량 초과 오류인지 판별 (429 상태 코드 + quota 관련 메시지 또는 RESOURCE_EXHAUSTED 상태)
    const isQuotaExhaustedError = (
        (statusCode === 429 && (detailedErrorMessage.includes('quota') || geminiErrorStatus === 'RESOURCE_EXHAUSTED')) ||
        (!statusCode && detailedErrorMessage.includes('quota') && (detailedErrorMessage.includes('exceeded') || detailedErrorMessage.includes('exhausted'))) ||
        geminiErrorStatus === 'RESOURCE_EXHAUSTED'
    );

    // 재시도 가능한 속도 제한 오류인지 판별 (429 상태 코드이지만 할당량 초과가 아닌 경우)
    const isRateLimitErrorForRetry = (statusCode === 429 && !isQuotaExhaustedError);
    
    return { detailedErrorMessage, statusCode, geminiErrorStatus, isQuotaExhaustedError, isRateLimitErrorForRetry, displayErrorMsg };
};


// Gemini AI를 사용하여 단어의 상세 정보를 생성하는 함수
const generateWordDetailsWithGemini = async (term: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 2, initialDelay = 7000): Promise<Partial<Word> | null> => {
    // AI 클라이언트가 초기화되지 않은 경우
    if (!ai) {
        addToast("AI 기능을 사용하려면 API 키가 필요합니다. 환경 변수를 확인해주세요.", "warning");
        return null;
    }
    // 현재 할당량 초과 상태인 경우
    if (isCurrentlyGeminiQuotaExhausted) {
        addToast(`Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. '${term}'에 대한 정보 가져오기를 건너뜁니다.`, "warning");
        return null;
    }

    setGlobalLoading(true);
    const modelName = 'gemini-2.5-flash-preview-04-17';
    const featureDescription = `'${term}' 단어 정보 조회`;
    const promptText = `Provide details for the English word "${term}". Your response MUST be a JSON object with the following fields: "pronunciation" (phonetic, optional), "partOfSpeech" (e.g., noun, verb, adjective, in Korean e.g., 명사, 동사), "meaning" (Korean meaning), "exampleSentence" (simple English example), "exampleSentenceMeaning" (Korean translation of example). Ensure exampleSentence is appropriate for language learners. If "${term}" seems like a typo or not a common English word, try to correct it if obvious and return details for the corrected term, including the corrected "term" in the JSON. If correction is not obvious or it's not a word, return null for all fields.

Example JSON:
{
  "term": "person", 
  "pronunciation": "/ˈpɜːrsən/",
  "partOfSpeech": "명사",
  "meaning": "사람",
  "exampleSentence": "This is a person.",
  "exampleSentenceMeaning": "이것은 사람입니다."
}`;

    let currentDelay = initialDelay;

    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for ${featureDescription}, attempt ${i + 1}/${retries + 1}`);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: promptText,
                    config: {
                      responseMimeType: "application/json",
                      temperature: 0.5, 
                    }
                });
                
                let jsonStr = response.text?.trim() || '';
                const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
                const match = jsonStr.match(fenceRegex);
                if (match && match[2]) {
                    jsonStr = match[2].trim();
                }

                const data = JSON.parse(jsonStr) as Partial<Word>;
                
                if (!data.partOfSpeech || !data.meaning || !data.exampleSentence) {
                    console.warn(`Gemini response missing essential fields for ${featureDescription} (attempt ${i + 1}/${retries + 1}):`, data);
                    if (i < retries) { 
                        addToast(`AI가 ${featureDescription} 정보를 일부 누락하여 반환했습니다. 재시도 중...(${i+1}/${retries+1})`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue; 
                    } else { 
                        addToast(`AI가 ${featureDescription}에 대한 충분한 정보를 제공하지 못했습니다. (누락된 필드: 뜻, 품사, 또는 예문) 모든 시도 실패.`, "error");
                        return { term }; 
                    }
                }
                return data;

            } catch (error: any) {
                const { isQuotaExhaustedError, isRateLimitErrorForRetry, displayErrorMsg, statusCode, geminiErrorStatus } = parseGeminiError(error);

                if (isQuotaExhaustedError) {
                    console.warn(`Gemini API call for ${featureDescription} failed on attempt ${i + 1}/${retries + 1} due to QUOTA EXHAUSTION (Code: ${statusCode}, Status: ${geminiErrorStatus}). Error: ${displayErrorMsg}. Cooldown will be activated. No further retries for this call.`);
                    setGeminiQuotaExhaustedCooldown(addToast, featureDescription);
                    return null; 
                }
                
                console.error(`Error during ${featureDescription} (attempt ${i + 1}/${retries + 1}). Status Code: ${statusCode}, Gemini Status: ${geminiErrorStatus}. Error: ${displayErrorMsg}`, error);

                if (i < retries) { 
                    if (isRateLimitErrorForRetry) { 
                        addToast(`Gemini API 요청 빈도가 높아 ${featureDescription} 가져오기에 실패했습니다. ${currentDelay/1000}초 후 재시도합니다...`, "warning");
                    } else { 
                        addToast(`${featureDescription} 가져오기 중 오류 발생. ${currentDelay/1000}초 후 재시도합니다... (오류: ${displayErrorMsg})`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2;
                } else { 
                    if (isRateLimitErrorForRetry) {
                         addToast(`Gemini API 요청 빈도가 너무 높습니다 (${featureDescription}). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`${featureDescription} 정보를 AI로부터 가져오는 데 최종 실패했습니다. (오류: ${displayErrorMsg})`, "error");
                    }
                    return null; 
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
    console.warn(`generateWordDetailsWithGemini for ${featureDescription} failed after all retries or due to unexpected flow.`);
    addToast(`${featureDescription} 정보를 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};

interface AIExampleSentence {
    newExampleSentence: string;
    newExampleSentenceMeaning: string;
}

const generateDifferentExampleSentenceWithGemini = async (word: Word, grade: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 2, initialDelay = 7000): Promise<AIExampleSentence | null> => {
    if (!ai) {
        addToast("AI 기능을 사용하려면 API 키가 필요합니다.", "warning");
        return null;
    }
     if (isCurrentlyGeminiQuotaExhausted) {
        addToast(`Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. '${word.term}'의 새 예문 생성을 건너뜁니다.`, "warning");
        return null;
    }
    setGlobalLoading(true);
    const modelName = 'gemini-2.5-flash-preview-04-17';
    const featureDescription = `'${word.term}' AI 예문 생성`;
    const promptText = `You are an English vocabulary tutor for Korean students.
The user is learning the word: "${word.term}" (Part of speech: ${word.partOfSpeech}, Korean meaning: ${word.meaning}).
The user's current grade level is: ${grade}.
The user has already seen this example: "${word.exampleSentence}"

Generate ONE NEW, DIFFERENT, and SIMPLE English example sentence for the word "${word.term}" that is appropriate for a ${grade} Korean student.
The new example sentence should clearly illustrate the meaning of "${word.term}".
Your response MUST be a JSON object with the following fields:
"newExampleSentence": "The new English example sentence.",
"newExampleSentenceMeaning": "The Korean translation of the new example sentence."

Example JSON response:
{
  "newExampleSentence": "She showed great courage when she helped the lost child.",
  "newExampleSentenceMeaning": "그녀는 길 잃은 아이를 도왔을 때 대단한 용기를 보여주었다."
}`;

    let currentDelay = initialDelay;
    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for ${featureDescription}, attempt ${i + 1}/${retries + 1}`);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: promptText,
                    config: {
                      responseMimeType: "application/json",
                      temperature: 0.7, 
                    }
                });
                
                let jsonStr = response.text?.trim() || '';
                const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
                const match = jsonStr.match(fenceRegex);
                if (match && match[2]) {
                    jsonStr = match[2].trim();
                }
                const data = JSON.parse(jsonStr) as AIExampleSentence;

                if (!data.newExampleSentence || !data.newExampleSentenceMeaning) {
                     console.warn(`Gemini response missing newExampleSentence or newExampleSentenceMeaning for ${featureDescription} (attempt ${i + 1}/${retries + 1}):`, data);
                     if (i < retries) {
                        addToast(`AI가 ${featureDescription} 정보를 일부 누락하여 반환했습니다. 재시도 중...`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue;
                     } else {
                        addToast(`AI가 ${featureDescription}에 대한 정보를 충분히 제공하지 못했습니다. 모든 시도 실패.`, "error");
                        return null;
                     }
                }
                return data;

            } catch (error: any) {
                const { isQuotaExhaustedError, isRateLimitErrorForRetry, displayErrorMsg, statusCode, geminiErrorStatus } = parseGeminiError(error);
                
                if (isQuotaExhaustedError) {
                    console.warn(`Gemini API call for ${featureDescription} failed on attempt ${i + 1}/${retries + 1} due to QUOTA EXHAUSTION (Code: ${statusCode}, Status: ${geminiErrorStatus}). Error: ${displayErrorMsg}. Cooldown will be activated. No further retries for this call.`);
                    setGeminiQuotaExhaustedCooldown(addToast, featureDescription);
                    return null; 
                }

                console.error(`Error during ${featureDescription} (attempt ${i + 1}/${retries + 1}). Status Code: ${statusCode}, Gemini Status: ${geminiErrorStatus}. Error: ${displayErrorMsg}`, error);

                if (i < retries) { 
                    if (isRateLimitErrorForRetry) { 
                        addToast(`Gemini API 요청 빈도가 높아 ${featureDescription}에 실패했습니다. ${currentDelay/1000}초 후 재시도합니다...`, "warning");
                    } else { 
                        addToast(`${featureDescription} 중 오류 발생. ${currentDelay/1000}초 후 재시도합니다... (오류: ${displayErrorMsg})`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2;
                } else { 
                    if (isRateLimitErrorForRetry) {
                        addToast(`Gemini API 요청 빈도가 너무 높습니다 (${featureDescription}). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다: ${displayErrorMsg}`, "error");
                    }
                    return null;
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
    console.warn(`generateDifferentExampleSentenceWithGemini for ${featureDescription} failed after all retries or due to unexpected flow.`);
    addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};


const generateSummaryWithGemini = async (textToSummarize: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 2, initialDelay = 5000): Promise<string | null> => {
    if (!ai) {
        addToast("AI 요약 기능을 사용하려면 API 키가 필요합니다.", "warning");
        return null;
    }
    if (isCurrentlyGeminiQuotaExhausted) {
        addToast("Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. 텍스트 요약을 건너뜁니다.", "warning");
        return null;
    }
    if (!textToSummarize.trim()) {
        addToast("요약할 텍스트가 없습니다.", "info");
        return null;
    }
    setGlobalLoading(true);
    const modelName = 'gemini-2.5-flash-preview-04-17';
    const featureDescription = "텍스트 요약";
    const promptText = `Your response MUST be a JSON object with a "summary" field. Please provide a brief summary of the following text in Korean (around 2-3 sentences), focusing on the main topics or themes. Text: """${textToSummarize.substring(0, 30000)}"""`; 

    let currentDelay = initialDelay;
    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for ${featureDescription}, attempt ${i + 1}/${retries + 1}`);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: promptText,
                    config: {
                        responseMimeType: "application/json",
                        temperature: 0.6,
                    }
                });

                let jsonStr = response.text?.trim() || '';
                const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
                const match = jsonStr.match(fenceRegex);
                if (match && match[2]) {
                    jsonStr = match[2].trim();
                }
                const data = JSON.parse(jsonStr) as { summary: string };

                if (!data.summary || !data.summary.trim()) {
                    console.warn(`Gemini response missing summary field for ${featureDescription} (attempt ${i + 1}/${retries + 1}).`, data);
                    if (i < retries) {
                        addToast(`AI 요약 생성 중 내용이 누락되었습니다. 재시도 중...`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue;
                    } else {
                        addToast(`AI가 텍스트 요약을 제공하지 못했습니다. 모든 시도 실패.`, "error");
                        return null;
                    }
                }
                return data.summary;

            } catch (error: any) {
                const { isQuotaExhaustedError, isRateLimitErrorForRetry, displayErrorMsg, statusCode, geminiErrorStatus } = parseGeminiError(error);

                if (isQuotaExhaustedError) {
                    console.warn(`Gemini API call for ${featureDescription} failed on attempt ${i + 1}/${retries + 1} due to QUOTA EXHAUSTION (Code: ${statusCode}, Status: ${geminiErrorStatus}). Error: ${displayErrorMsg}. Cooldown will be activated. No further retries for this call.`);
                    setGeminiQuotaExhaustedCooldown(addToast, featureDescription);
                    return null; 
                }
                
                console.error(`Error during ${featureDescription} (attempt ${i + 1}/${retries + 1}). Status Code: ${statusCode}, Gemini Status: ${geminiErrorStatus}. Error: ${displayErrorMsg}`, error);

                if (i < retries) {
                    if (isRateLimitErrorForRetry) {
                        addToast(`Gemini API 요청 빈도가 높아 ${featureDescription}에 실패했습니다. ${currentDelay / 1000}초 후 재시도합니다...`, "warning");
                    } else {
                        addToast(`${featureDescription} 중 오류 발생. ${currentDelay / 1000}초 후 재시도합니다... (오류: ${displayErrorMsg})`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2;
                } else { 
                    if (isRateLimitErrorForRetry) {
                        addToast(`Gemini API 요청 빈도가 너무 높습니다 (${featureDescription}). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다: ${displayErrorMsg}`, "error");
                    }
                    return null;
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
     console.warn(`generateSummaryWithGemini for ${featureDescription} failed after all retries or due to unexpected flow.`);
    addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};

const generateImageForWordWithGemini = async (wordTerm: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 1, initialDelay = 8000): Promise<string | null> => {
    if (!ai) {
        addToast("AI 이미지 생성 기능을 사용하려면 API 키가 필요합니다.", "warning");
        return null;
    }
    if (isCurrentlyGeminiQuotaExhausted) {
        addToast(`Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. '${wordTerm}'의 이미지 생성을 건너뜁니다.`, "warning");
        return null;
    }
    setGlobalLoading(true);
    const modelName = 'imagen-3.0-generate-002';
    const featureDescription = `'${wordTerm}' AI 이미지 생성`;
    const prompt = `A clear, simple, educational, dictionary illustration style image representing the English word: "${wordTerm}". Focus on a single, easily recognizable subject related to the word's most common meaning. Vibrant and kid-friendly.`;

    let currentDelay = initialDelay;
    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for ${featureDescription}, attempt ${i + 1}/${retries + 1}`);
                const response = await ai.models.generateImages({
                    model: modelName,
                    prompt: prompt,
                    config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }, 
                });

                if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image?.imageBytes) {
                    addToast(`${featureDescription}이(가) 완료되었습니다.`, "success");
                    return response.generatedImages[0].image.imageBytes;
                } else {
                    console.warn(`Gemini image response missing imageBytes for ${featureDescription} (attempt ${i + 1}/${retries + 1}):`, response);
                    if (i < retries) {
                        addToast(`AI가 '${wordTerm}' 이미지를 반환했지만 데이터가 누락되었습니다. 재시도 중...`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue;
                    } else {
                        addToast(`AI가 '${wordTerm}'에 대한 이미지를 제공하지 못했습니다. 모든 시도 실패.`, "error");
                        return null;
                    }
                }
            } catch (error: any) {
                const { isQuotaExhaustedError, isRateLimitErrorForRetry, displayErrorMsg, statusCode, geminiErrorStatus } = parseGeminiError(error);

                if (isQuotaExhaustedError) {
                    console.warn(`Gemini API call for ${featureDescription} failed on attempt ${i + 1}/${retries + 1} due to QUOTA EXHAUSTION (Code: ${statusCode}, Status: ${geminiErrorStatus}). Error: ${displayErrorMsg}. Cooldown will be activated. No further retries for this call.`);
                    setGeminiQuotaExhaustedCooldown(addToast, featureDescription);
                    return null; 
                }

                console.error(`Error during ${featureDescription} (attempt ${i + 1}/${retries + 1}). Status Code: ${statusCode}, Gemini Status: ${geminiErrorStatus}. Error: ${displayErrorMsg}`, error);
                
                if (i < retries) {
                    if (isRateLimitErrorForRetry) {
                        addToast(`Gemini API 요청 빈도가 높아 ${featureDescription}에 실패했습니다. ${currentDelay / 1000}초 후 재시도합니다...`, "warning");
                    } else {
                        addToast(`${featureDescription} 중 오류 발생. ${currentDelay / 1000}초 후 재시도합니다... (오류: ${displayErrorMsg})`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2;
                } else { 
                    if (isRateLimitErrorForRetry) {
                        addToast(`Gemini API 요청 빈도가 너무 높습니다 (${featureDescription}). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다: ${displayErrorMsg}`, "error");
                    }
                    return null;
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
    console.warn(`generateImageForWordWithGemini for ${featureDescription} failed after all retries or due to unexpected flow.`);
    addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};


// --- App Context ---
interface AppContextType {
    userSettings: UserSettings;
    handleSaveSettings: (settings: UserSettings) => void;
    handleResetData: () => void;
    onNavigate: (screen: AppScreen, params?: any) => void;
    allWords: Word[];
    wordStats: Record<string | number, WordStat>;
    handleWordLearned: (wordId: string | number) => void;
    handleQuizComplete: (score: number, total: number, incorrectWords: Word[]) => void;
    updateWordStat: (wordId: string | number, updates: Partial<WordStat>) => void;
    handleDeleteCustomWord: (wordId: string | number, options?: { silent: boolean }) => void;
    handleSaveCustomWord: (word: Partial<Word>, gradeLevel?: string, unit?: number) => Promise<{ success: boolean; reason?: string }>;
    memoizedStats: {
        learnedWordsToday: number;
        totalWordsLearned: number;
        learningStreak: { currentStreak: number; bestStreak: number };
        averageQuizScore: number;
        quizTakenToday: boolean;
        gamePlayedToday: boolean;
        hasIncorrectWordsToReview: boolean;
    };
    setGlobalLoading: (loading: boolean) => void;
    addXp: (amount: number) => void;
    handleGameComplete: (score: number, correct: number, incorrect: number, timeTaken: number) => void;
    isSettingsModalOpen: boolean;
    handleOpenSettings: () => void;
    handleCloseSettings: () => void;
    appScreen: AppScreen;
    routeParams: any;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};


// --- UI Components ---

// Confirmation Modal
interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
}
const ConfirmationModal: React.FC<ConfirmationModalProps> = React.memo(({ isOpen, title, message, onConfirm, onCancel, confirmText = "확인", cancelText = "취소", confirmButtonClass = "bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800" }) => {
    if (!isOpen) return null;

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="confirmation-modal-title" className="fixed inset-0 bg-slate-900/75 dark:bg-slate-900/80 flex justify-center items-center p-4 z-[60] animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 id="confirmation-modal-title" className="text-xl font-semibold text-cyan-600 dark:text-cyan-400 mb-4">{title}</h3>
                <p className="text-slate-600 dark:text-slate-300 mb-6">{message}</p>
                <div className="flex justify-end space-x-3">
                    <button onClick={onCancel} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded text-slate-700 dark:text-white transition-colors">
                        {cancelText}
                    </button>
                    <button onClick={onConfirm} className={`px-4 py-2 rounded text-white transition-colors ${confirmButtonClass}`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
});


// Edit Settings Modal
interface EditSettingsModalProps {
    isOpen: boolean;
    onCancel: () => void;
}
const EditSettingsModal: React.FC<EditSettingsModalProps> = React.memo(({ isOpen, onCancel }) => {
    const { userSettings, handleSaveSettings, handleResetData } = useAppContext();
    const { addToast } = useToasts();
    
    const [username, setUsername] = useState(userSettings.username);
    const [grade, setGrade] = useState(userSettings.grade);
    const [dailyGoal, setDailyGoal] = useState(userSettings.dailyGoal);
    const [speechRate, setSpeechRate] = useState(userSettings.speechRate);
    const [autoPlayAudio, setAutoPlayAudio] = useState(userSettings.autoPlayAudio);
    const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setUsername(userSettings.username);
            setGrade(userSettings.grade);
            setDailyGoal(userSettings.dailyGoal);
            setSpeechRate(userSettings.speechRate);
            setAutoPlayAudio(userSettings.autoPlayAudio);
        }
    }, [userSettings, isOpen]); 

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) {
            addToast("사용자 이름은 비워둘 수 없습니다.", "warning");
            return;
        }
        handleSaveSettings({ ...userSettings, username: username.trim(), grade, dailyGoal, speechRate, autoPlayAudio });
        onCancel();
    };

    const handleResetClick = () => {
        setShowResetConfirmModal(true);
    };

    const confirmResetData = () => {
        handleResetData();
        setShowResetConfirmModal(false);
        onCancel(); // Close settings modal after reset initiated
    };

    return (
        <>
        <div role="dialog" aria-modal="true" aria-labelledby="edit-settings-modal-title" className="fixed inset-0 bg-slate-900/75 dark:bg-slate-900/80 flex justify-center items-center p-4 z-[60] animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h3 id="edit-settings-modal-title" className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-6 text-center">설정 변경</h3>
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Username, Grade, Daily Goal */}
                    <div>
                        <label htmlFor="edit-username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">사용자 이름</label>
                        <input type="text" id="edit-username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" required />
                    </div>
                    <div>
                        <label htmlFor="edit-grade" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">학년 선택</label>
                        <select id="edit-grade" value={grade} onChange={(e) => setGrade(e.target.value)} className="w-full p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500">
                            <option value="middle1">중학교 1학년</option>
                            <option value="middle2">중학교 2학년</option>
                            <option value="middle3">중학교 3학년</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="edit-dailyGoal" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">일일 학습 목표 (단어 수)</label>
                        <input type="number" id="edit-dailyGoal" value={dailyGoal} onChange={(e) => setDailyGoal(Math.max(1, parseInt(e.target.value) || 1))} min="1" className="w-full p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                    </div>

                     {/* Theme Selection */}


                    {/* Speech Rate */}
                    <div>
                        <label htmlFor="edit-speechRate" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">말하기 속도: <span className="font-semibold text-cyan-600 dark:text-cyan-400">{speechRate.toFixed(1)}x</span></label>
                        <input type="range" id="edit-speechRate" min="0.5" max="2" step="0.1" value={speechRate} onChange={(e) => setSpeechRate(parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                    </div>

                    {/* Auto-play Audio */}
                    <div className="flex items-center justify-between">
                         <span className="text-sm font-medium text-slate-700 dark:text-slate-300">학습 중 새 단어 자동 재생</span>
                        <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                            <input type="checkbox" name="autoPlayAudio" id="autoPlayAudio-toggle" checked={autoPlayAudio} onChange={() => setAutoPlayAudio(!autoPlayAudio)} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer border-slate-300 dark:border-slate-500"/>
                            <label htmlFor="autoPlayAudio-toggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-slate-300 dark:bg-slate-500 cursor-pointer"></label>
                        </div>
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-5 space-y-3">
                         <button 
                            type="button" 
                            onClick={handleResetClick}
                            className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 rounded text-white text-sm"
                        >
                            학습 데이터 초기화
                        </button>
                        <div className="flex justify-end space-x-3">
                            <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded text-slate-700 dark:text-white">취소</button>
                            <button type="submit" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded text-white">저장</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
        <ConfirmationModal
                isOpen={showResetConfirmModal}
                title="데이터 초기화 확인"
                message="정말로 모든 학습 데이터와 설정을 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다."
                onConfirm={confirmResetData}
                onCancel={() => setShowResetConfirmModal(false)}
                confirmText="초기화"
                confirmButtonClass="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            />
        </>
    );
});


// Navigation Bar Component
interface NavBarProps {
    currentScreen: AppScreen;
    onOpenSettings: () => void;
}
const NavBar: React.FC<NavBarProps> = React.memo(({ currentScreen, onOpenSettings }) => {
    const { onNavigate, userSettings } = useAppContext();
    
    const navItems: { screen: AppScreen; label: string; icon: string }[] = [
        { screen: 'dashboard', label: '대시보드', icon: '🏠' },
        { screen: 'learnWords', label: '단어 학습', icon: '📖' },
        { screen: 'quiz', label: '퀴즈', icon: '📝' },
        { screen: 'tutorChat', label: 'AI 튜터', icon: '💬' },
        { screen: 'gameSelection', label: '게임 모드', icon: '🎮' },
        { screen: 'allWords', label: '전체 단어', icon: '📚' },
        { screen: 'manageWords', label: '단어 추가', icon: '➕' },
        { screen: 'stats', label: '통계', icon: '📊' },
    ];

    if (!userSettings) return null; 

    return (
        <nav className="bg-slate-100 dark:bg-slate-700 p-3 shadow-md sticky top-0 z-50 border-b border-slate-200 dark:border-slate-600">
            <ul className="flex flex-wrap justify-center items-center gap-1 sm:gap-2">
                {navItems.map((item) => (
                    <li key={item.screen}>
                        <button
                            onClick={() => onNavigate(item.screen)}
                            aria-current={currentScreen === item.screen ? "page" : undefined}
                            className={`flex flex-col sm:flex-row items-center justify-center p-1.5 sm:px-2.5 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors duration-150 ease-in-out
                                ${currentScreen === item.screen
                                    ? 'bg-cyan-500 text-white shadow-lg ring-2 ring-cyan-300 dark:ring-cyan-600'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-800 dark:hover:text-white'
                                }`}
                        >
                            <span className="text-base sm:text-lg sm:mr-1.5 mb-0.5 sm:mb-0">{item.icon}</span>
                            {item.label}
                        </button>
                    </li>
                ))}
                 <li>
                    <button
                        onClick={onOpenSettings}
                        title="설정 변경"
                        aria-label="설정 변경"
                        className="flex flex-col sm:flex-row items-center justify-center p-1.5 sm:px-2.5 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-800 dark:hover:text-white transition-colors"
                    >
                        <span className="text-base sm:text-lg sm:mr-1.5 mb-0.5 sm:mb-0">⚙️</span>
                        <span className="hidden sm:inline">설정</span>
                        <span className="sm:hidden">설정</span>
                    </button>
                </li>
            </ul>
        </nav>
    );
});


// Login/Setup Screen Component
interface LoginSetupScreenProps {
    onSetupComplete: (settings: UserSettings) => void;
}
const LoginSetupScreen: React.FC<LoginSetupScreenProps> = ({ onSetupComplete }) => {
    const { addToast } = useToasts();
    const [username, setUsername] = useState('');
    const [grade, setGrade] = useState('middle1');
    const [dailyGoal, setDailyGoal] = useState(10);
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) {
            addToast("사용자 이름을 입력해주세요.", "warning");
            return;
        }
        onSetupComplete({ 
            username: username.trim(), 
            grade, 
            textbook: '', 
            dailyGoal,
            theme, 
            speechRate: 1.0, 
            autoPlayAudio: true,
            xp: 0,
            level: 1,
            currentStreak: 0,
            bestStreak: 0,
            lastLearnedDate: undefined,
            lastQuizDate: undefined,
            lastQuizScore: undefined,
            lastGameDate: undefined,
        });
    };

    return (
        <div className="p-6 sm:p-8 bg-slate-100 dark:bg-slate-800 min-h-screen flex flex-col justify-center items-center">
            <div className="w-full max-w-md bg-white dark:bg-slate-700 p-8 rounded-xl shadow-2xl">
                <h1 className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-8 text-center">AI 영단어 학습 설정</h1>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">사용자 이름</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-3 bg-slate-100 dark:bg-slate-600 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            placeholder="이름을 입력하세요"
                            aria-required="true"
                        />
                    </div>
                    <div>
                        <label htmlFor="grade" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">학년 선택</label>
                        <select
                            id="grade"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                            className="w-full p-3 bg-slate-100 dark:bg-slate-600 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            aria-required="true"
                        >
                            <option value="middle1">중학교 1학년</option>
                            <option value="middle2">중학교 2학년</option>
                            <option value="middle3">중학교 3학년</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="dailyGoal" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">일일 학습 목표 (단어 수)</label>
                        <input
                            type="number"
                            id="dailyGoal"
                            value={dailyGoal}
                            onChange={(e) => setDailyGoal(Math.max(1, parseInt(e.target.value) || 1))}
                            min="1"
                            className="w-full p-3 bg-slate-100 dark:bg-slate-600 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            aria-required="true"
                        />
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">테마 선택</span>
                        <div className="flex space-x-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="theme" 
                                    value="light" 
                                    checked={theme === 'light'} 
                                    onChange={() => {
                                        setTheme('light');
                                        document.documentElement.classList.remove('dark');
                                    }} 
                                    className="form-radio text-cyan-500 focus:ring-cyan-500"
                                />
                                <span className="text-slate-700 dark:text-slate-300">밝은 테마</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="theme" 
                                    value="dark" 
                                    checked={theme === 'dark'} 
                                    onChange={() => {
                                        setTheme('dark');
                                        document.documentElement.classList.add('dark');
                                    }} 
                                    className="form-radio text-cyan-500 focus:ring-cyan-500"
                                />
                                <span className="text-slate-700 dark:text-slate-300">어두운 테마</span>
                            </label>
                        </div>
                    </div>
                    <button
                        type="submit"
                        className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-75"
                    >
                        학습 시작
                    </button>
                </form>
            </div>
        </div>
    );
};


// Dashboard Screen Component
interface DashboardScreenProps {
    learnedWordsToday: number;
    totalWordsLearned: number;
    learningStreak: { currentStreak: number; bestStreak: number };
    averageQuizScore: number;
    quizTakenToday: boolean;
    gamePlayedToday: boolean;
    hasIncorrectWordsToReview: boolean;
}
const DashboardScreen: React.FC<DashboardScreenProps> = React.memo(({ 
    learnedWordsToday, 
    totalWordsLearned,
    learningStreak,
    averageQuizScore,
    quizTakenToday,
    gamePlayedToday,
    hasIncorrectWordsToReview,
}) => {
    const { userSettings, onNavigate } = useAppContext();
    const { addToast } = useToasts();

    const dailyGoalAchieved = learnedWordsToday >= userSettings.dailyGoal;
    const xpForNextLevel = (userSettings.level) * 100; // Example: Level 1 needs 100 XP total, Level 2 needs 200 XP total for next level

    const renderChallengeItem = (text: string, isAchieved: boolean, reward: number, actionButton?: {label: string, onClick: () => void}) => (
         <li className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-md shadow-sm">
            <div className="flex items-center">
                <span className={`mr-3 text-xl ${isAchieved ? 'text-green-500' : 'text-slate-400 dark:text-slate-500'}`}>
                    {isAchieved ? '✅' : '⚪'}
                </span>
                <span className={`text-sm sm:text-base ${isAchieved ? 'line-through text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                    {text}
                </span>
            </div>
            {actionButton && !isAchieved ? (
                 <button 
                    onClick={actionButton.onClick}
                    className="ml-2 px-2 py-1 text-xs bg-cyan-500 hover:bg-cyan-600 text-white rounded-md"
                >
                    {actionButton.label}
                </button>
            ) : (
                <span className={`text-xs font-medium ${isAchieved ? 'text-green-500' : 'text-yellow-500 dark:text-yellow-400'}`}>
                    +{reward} XP
                </span>
            )}
        </li>
    );

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400">
                안녕하세요, {userSettings.username}님! 👋 (Lv. {userSettings.level})
            </h1>

            {/* XP and Level Progress */}
            <div className="bg-slate-100 dark:bg-slate-700 p-4 sm:p-6 rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-1">
                    <h2 className="text-md sm:text-lg font-semibold text-cyan-700 dark:text-cyan-300">경험치 (XP)</h2>
                    <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Lv. {userSettings.level}</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">
                    {userSettings.xp} / {xpForNextLevel} XP
                </p>
                <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2.5 sm:h-3.5 mt-2 overflow-hidden" role="progressbar" aria-valuenow={userSettings.xp} aria-valuemin={0} aria-valuemax={xpForNextLevel}>
                    <div
                        className="bg-yellow-500 h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.min(100, (userSettings.xp / Math.max(1, xpForNextLevel)) * 100)}%` }}
                    ></div>
                </div>
                 <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-right">다음 레벨까지 {Math.max(0, xpForNextLevel - userSettings.xp)} XP</p>
            </div>


            {/* Today's Learning Goal */}
            <div className="bg-slate-100 dark:bg-slate-700 p-4 sm:p-6 rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg sm:text-xl font-semibold text-cyan-700 dark:text-cyan-300">오늘의 학습 목표</h2>
                    <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${dailyGoalAchieved ? 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-700 dark:text-yellow-100'}`}>
                        {dailyGoalAchieved ? '목표 달성! 🎉' : '진행 중'}
                    </span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">{learnedWordsToday} / {userSettings.dailyGoal} 단어</p>
                <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-3 sm:h-4 mt-3 overflow-hidden" role="progressbar" aria-valuenow={learnedWordsToday} aria-valuemin={0} aria-valuemax={userSettings.dailyGoal}>
                    <div
                        className="bg-green-500 h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.min(100, (learnedWordsToday / Math.max(1,userSettings.dailyGoal)) * 100)}%` }}
                    ></div>
                </div>
            </div>

            {/* Key Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg text-center sm:text-left">
                    <h3 className="text-md sm:text-lg font-semibold text-cyan-700 dark:text-cyan-300 mb-1">📚 총 학습 단어</h3>
                    <p className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">{totalWordsLearned} <span className="text-sm">개</span></p>
                </div>
                <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg text-center sm:text-left">
                    <h3 className="text-md sm:text-lg font-semibold text-cyan-700 dark:text-cyan-300 mb-1">🔥 연속 학습</h3>
                    <p className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">현재: {learningStreak.currentStreak}일</p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">최고: {learningStreak.bestStreak}일</p>
                </div>
                <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg text-center sm:text-left">
                    <h3 className="text-md sm:text-lg font-semibold text-cyan-700 dark:text-cyan-300 mb-1">📊 학습 요약</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">오늘 학습: <span className="font-semibold">{learnedWordsToday}</span> 단어</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">평균 퀴즈 정답률: <span className="font-semibold">{averageQuizScore.toFixed(1)}%</span></p>
                </div>
            </div>
            
            {/* Today's Challenges */}
            <div className="bg-slate-100 dark:bg-slate-700 p-4 sm:p-6 rounded-lg shadow-lg">
                <h2 className="text-lg sm:text-xl font-semibold text-cyan-700 dark:text-cyan-300 mb-3">⭐ 오늘의 도전 과제</h2>
                <ul className="space-y-2">
                    {renderChallengeItem(
                        `오늘 단어 ${userSettings.dailyGoal}개 학습`,
                        dailyGoalAchieved,
                        20
                    )}
                    {renderChallengeItem(
                        "퀴즈 1회 완료",
                        quizTakenToday,
                        15,
                        !quizTakenToday ? { label: "퀴즈 풀기", onClick: () => onNavigate('quiz') } : undefined
                    )}
                     {renderChallengeItem(
                        "게임 모드 1회 플레이",
                        gamePlayedToday,
                        25,
                        !gamePlayedToday ? { label: "게임 하러가기", onClick: () => onNavigate('gameSelection') } : undefined
                    )}
                    {renderChallengeItem(
                        "오답 단어 복습하기",
                        false, 
                        10,
                        hasIncorrectWordsToReview ? { label: "복습 하러가기", onClick: () => onNavigate('quiz') } : { label: "오답 없음", onClick: () => addToast("복습할 오답 단어가 없습니다!", "info") }
                    )}
                </ul>
            </div>
            
            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                 <button
                    onClick={() => onNavigate('learnWords')}
                    className="py-3 px-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                    <span className="text-xl mr-2" aria-hidden="true">📖</span> 학습
                </button>
                 <button
                    onClick={() => onNavigate('quiz')}
                    className="py-3 px-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                     <span className="text-xl mr-2" aria-hidden="true">📝</span> 퀴즈
                </button>
                 <button
                    onClick={() => onNavigate('gameSelection')}
                    className="py-3 px-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                     <span className="text-xl mr-2" aria-hidden="true">🎮</span> 게임
                </button>
                 <button
                    onClick={() => onNavigate('tutorChat')}
                    className="py-3 px-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                     <span className="text-xl mr-2" aria-hidden="true">💬</span> AI튜터
                </button>
            </div>

            <footer className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-600 text-center text-xs text-slate-500 dark:text-slate-400">
                <a href="#" onClick={(e)=>{e.preventDefault(); addToast("도움말 기능은 준비 중입니다.", "info")}} className="hover:underline">도움말</a>
                <span className="mx-2">|</span>
                <a href="#" onClick={(e)=>{e.preventDefault(); addToast("앱 설치 안내는 준비 중입니다. 브라우저의 '홈 화면에 추가' 기능을 사용해보세요.", "info")}} className="hover:underline">앱 설치 안내</a>
            </footer>
        </div>
    );
});


// LearnWords Screen Component (Refactored for Unit-based learning and Card Flip)
interface LearnWordsScreenProps {
    routeParams?: any;
}
const LearnWordsScreen: React.FC<LearnWordsScreenProps> = ({ routeParams }) => {
    const { userSettings, onNavigate, allWords, handleWordLearned } = useAppContext();
    const { addToast } = useToasts();
    
    const [mode, setMode] = useState<'selecting' | 'learning'>(routeParams?.unitToLearn ? 'learning' : 'selecting');
    const [selectedUnit, setSelectedUnit] = useState<string | number | null>(routeParams?.unitToLearn || null);
    const [dropdownSelection, setDropdownSelection] = useState<string | number>(routeParams?.unitToLearn || 'all');
    const [learningWords, setLearningWords] = useState<Word[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    const currentWord = learningWords[currentIndex];

    const units = useMemo(() => {
        const unitSet = new Set<string | number>();
        allWords.forEach(word => {
            if (word.unit) unitSet.add(word.unit);
        });
        return Array.from(unitSet).sort((a, b) => Number(a) - Number(b));
    }, [allWords]);

    useEffect(() => {
        if (mode === 'learning' && currentWord && userSettings.autoPlayAudio) {
            const speakWithDelay = setTimeout(() => {
                speak(currentWord.term, undefined, userSettings.speechRate);
            }, 100);
            return () => clearTimeout(speakWithDelay);
        }
    }, [currentWord, mode, userSettings.autoPlayAudio, userSettings.speechRate]);

    const startLearningSession = useCallback((unit: string | number) => {
        let wordsForSession: Word[];

        if (unit === 'all') {
            if (allWords.length < 10) {
                 addToast(`'전체' 모드를 위해 단어가 최소 10개 필요합니다.`, "warning");
                 return;
            }
            wordsForSession = shuffleArray(allWords).slice(0, 30);
        } else {
            const filteredWords = allWords.filter(w => String(w.unit) === String(unit));
            wordsForSession = shuffleArray(filteredWords);
        }

        if (wordsForSession.length === 0) {
            addToast(unit === 'all' ? `학습할 단어가 없습니다.` : `단원 ${unit}에 학습할 단어가 없습니다.`, "warning");
            return;
        }

        setLearningWords(wordsForSession);
        setSelectedUnit(unit);
        setCurrentIndex(0);
        setIsFlipped(false);
        setMode('learning');
    }, [allWords, addToast]);

    useEffect(() => {
        if (mode === 'learning' && selectedUnit && learningWords.length === 0) {
            startLearningSession(selectedUnit);
        }
    }, [mode, selectedUnit, startLearningSession, learningWords.length]);
    
    const resetWordSpecificStates = useCallback(() => {
        setIsFlipped(false);
    }, []);

    const handleNextWord = () => {
        handleWordLearned(currentWord.id);
        if (currentIndex < learningWords.length - 1) {
            resetWordSpecificStates();
            setCurrentIndex(prevIndex => prevIndex + 1);
        } else {
            const unitName = selectedUnit === 'all' ? '전체 학습' : `단원 ${selectedUnit}`;
            addToast(`${unitName} 학습을 완료했습니다! 🎉`, "success");
            onNavigate('dashboard');
        }
    };

    const handlePreviousWord = () => {
        if (currentIndex > 0) {
            resetWordSpecificStates();
            setCurrentIndex(prevIndex => prevIndex - 1);
        }
    };
    
    if (mode === 'selecting') {
        return (
            <div className="p-4 sm:p-8 flex flex-col items-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">학습 모드 선택</h1>
                <div className="w-full max-w-md bg-slate-100 dark:bg-slate-700 p-6 rounded-lg shadow-lg space-y-6">
                    <div>
                        <label htmlFor="unit-select-learn" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">모드 선택</label>
                        <select
                            id="unit-select-learn"
                            value={dropdownSelection}
                            onChange={(e) => setDropdownSelection(e.target.value)}
                            className="w-full p-3 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-cyan-500"
                        >
                            <option value="all">전체 단어 (랜덤 30단어)</option>
                            <optgroup label="단원별 학습">
                                {units.map(unit => <option key={unit} value={unit}>단원 {unit}</option>)}
                            </optgroup>
                        </select>
                    </div>
                    <button 
                        onClick={() => startLearningSession(dropdownSelection)} 
                        className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md"
                    >
                        학습 시작
                    </button>
                </div>
                 <div className="text-center mt-8">
                     <button onClick={() => onNavigate('dashboard')} className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline">
                        대시보드로 돌아가기
                    </button>
                </div>
            </div>
        );
    }
    
    const unitName = selectedUnit === 'all' ? '전체 학습' : `단원 ${selectedUnit}`;

    if (!currentWord) {
        return (
            <div className="p-8 text-center text-xl text-slate-600 dark:text-slate-300">
                <p>단어를 불러오는 중...</p>
                <button onClick={() => setMode('selecting')} className="mt-4 text-sm text-cyan-600 dark:text-cyan-400 hover:underline">
                    학습 모드 선택으로 돌아가기
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-4 sm:mb-6">
                {unitName} ({currentIndex + 1} / {learningWords.length})
            </h1>

            <div className="w-full max-w-lg perspective cursor-pointer" onClick={() => setIsFlipped(f => !f)}>
                <div className={`card-inner ${isFlipped ? 'is-flipped' : ''}`}>
                    {/* Front Face */}
                    <div className="card-face bg-slate-100 dark:bg-slate-700 p-6 sm:p-8">
                        <button 
                            onClick={(e) => { e.stopPropagation(); speak(currentWord.term, undefined, userSettings.speechRate); }} 
                            className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 text-3xl z-10" 
                            aria-label="단어 발음 듣기"
                        >
                            🔊
                        </button>
                        <h2 className="text-5xl sm:text-6xl font-bold text-slate-800 dark:text-white mb-3 break-all">{currentWord.term}</h2>
                        {currentWord.pronunciation && <p className="text-slate-500 dark:text-slate-400 text-lg mb-2">[{currentWord.pronunciation}]</p>}
                        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">카드를 클릭하여 뜻을 확인하세요.</p>
                    </div>
                    {/* Back Face */}
                    <div className="card-face card-back bg-cyan-50 dark:bg-slate-800 p-6 sm:p-8 text-left overflow-y-auto custom-scrollbar">
                        <div className="w-full">
                             <button 
                                onClick={(e) => { e.stopPropagation(); speak(currentWord.exampleSentence, undefined, userSettings.speechRate); }} 
                                className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 text-3xl z-10" 
                                aria-label="예문 발음 듣기"
                            >
                                🔊
                            </button>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">{currentWord.term}</h2>
                            <p className="text-xl text-cyan-600 dark:text-cyan-300 font-semibold mb-4">{currentWord.partOfSpeech}: {currentWord.meaning}</p>
                            
                            <div className="mt-3 pt-3 border-t border-slate-300 dark:border-slate-600">
                                <p className="text-slate-700 dark:text-slate-200"><span className="font-semibold">예문:</span> {currentWord.exampleSentence}</p>
                                {currentWord.exampleSentenceMeaning && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1"><span className="font-semibold">해석:</span> {currentWord.exampleSentenceMeaning}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-between mt-6 w-full max-w-lg">
                <button
                    onClick={handlePreviousWord}
                    disabled={currentIndex === 0}
                    className="w-1/2 mr-2 py-3 px-4 bg-slate-400 hover:bg-slate-500 text-white font-bold rounded-md shadow-lg transition-colors disabled:opacity-50"
                >
                    이전 단어
                </button>
                <button
                    onClick={handleNextWord}
                    className="w-1/2 ml-2 py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-md shadow-lg transition-colors"
                >
                   {currentIndex === learningWords.length - 1 ? '학습 완료' : '다음 단어'}
                </button>
            </div>
            
            <button onClick={() => setMode('selecting')} className="mt-8 text-sm text-cyan-600 dark:text-cyan-400 hover:underline">
                다른 학습 모드 선택하기
            </button>
        </div>
    );
};


// Quiz Screen Component (Refactored to use useReducer)
interface QuizScreenProps {
    routeParams?: any;
}

type QuizScreenState = {
    quizState: 'setup' | 'playing' | 'finished';
    selectedUnit: string | number;
    quizType: 'multiple' | 'typing';
    quizWords: Word[];
    currentQuestionIndex: number;
    score: number;
    incorrectlyAnsweredWords: Word[];
    options: string[];
    selectedAnswer: string | null;
    showResult: boolean;
    typedAnswer: string;
    inputFeedbackStyle: string;
};

type QuizAction =
  | { type: 'CHANGE_SETUP'; payload: { key: 'selectedUnit' | 'quizType' | 'typedAnswer'; value: string } }
  | { type: 'START_QUIZ'; payload: { quizWords: Word[]; options: string[] } }
  | { type: 'SUBMIT_MULTIPLE_CHOICE'; payload: { selectedAnswer: string; isCorrect: boolean; word: Word } }
  | { type: 'SUBMIT_TYPING'; payload: { isCorrect: boolean; word: Word } }
  | { type: 'NEXT_QUESTION'; payload: { options: string[] } }
  | { type: 'FINISH_QUIZ' }
  | { type: 'RESTART_QUIZ' };


const QuizScreen: React.FC<QuizScreenProps> = ({ routeParams }) => {
    const { userSettings, onNavigate, allWords, wordStats, handleQuizComplete, updateWordStat } = useAppContext();
    const { addToast } = useToasts();
    
    const initialQuizState: QuizScreenState = {
        quizState: 'setup',
        selectedUnit: routeParams?.unitToLearn || 'all',
        quizType: 'multiple',
        quizWords: [],
        currentQuestionIndex: 0,
        score: 0,
        incorrectlyAnsweredWords: [],
        options: [],
        selectedAnswer: null,
        showResult: false,
        typedAnswer: '',
        inputFeedbackStyle: 'border-slate-300 dark:border-slate-500 focus:ring-cyan-500 focus:border-cyan-500',
    };

    const quizReducer = (state: QuizScreenState, action: QuizAction): QuizScreenState => {
        switch (action.type) {
            case 'CHANGE_SETUP':
                return { ...state, [action.payload.key]: action.payload.value };
            
            case 'START_QUIZ':
                return {
                    ...initialQuizState,
                    quizState: 'playing',
                    quizType: state.quizType,
                    selectedUnit: state.selectedUnit,
                    quizWords: action.payload.quizWords,
                    options: action.payload.options,
                };

            case 'SUBMIT_MULTIPLE_CHOICE': {
                const { selectedAnswer, isCorrect, word } = action.payload;
                return {
                    ...state,
                    selectedAnswer,
                    showResult: true,
                    score: isCorrect ? state.score + 1 : state.score,
                    incorrectlyAnsweredWords: isCorrect ? state.incorrectlyAnsweredWords : [...state.incorrectlyAnsweredWords, word],
                };
            }

            case 'SUBMIT_TYPING': {
                const { isCorrect, word } = action.payload;
                return {
                    ...state,
                    inputFeedbackStyle: isCorrect ? 'border-green-500 ring-2 ring-green-500' : 'border-red-500 ring-2 ring-red-500 animate-shake',
                    showResult: true, // Show result immediately for typing
                    score: isCorrect ? state.score + 1 : state.score,
                    incorrectlyAnsweredWords: isCorrect ? state.incorrectlyAnsweredWords : [...state.incorrectlyAnsweredWords, word],
                };
            }
            
            case 'NEXT_QUESTION':
                return {
                    ...state,
                    currentQuestionIndex: state.currentQuestionIndex + 1,
                    options: action.payload.options,
                    selectedAnswer: null,
                    showResult: false,
                    typedAnswer: '',
                    inputFeedbackStyle: 'border-slate-300 dark:border-slate-500 focus:ring-cyan-500 focus:border-cyan-500',
                };

            case 'FINISH_QUIZ':
                handleQuizComplete(state.score, state.quizWords.length, state.incorrectlyAnsweredWords);
                return { ...state, quizState: 'finished' };
            
            case 'RESTART_QUIZ':
                return { ...initialQuizState, selectedUnit: state.selectedUnit, quizType: state.quizType }; // keep setup options

            default:
                throw new Error("Unhandled action in quizReducer");
        }
    };

    const [state, dispatch] = useReducer(quizReducer, initialQuizState);
    const { quizState, selectedUnit, quizType, quizWords, currentQuestionIndex, score, incorrectlyAnsweredWords, options, selectedAnswer, showResult, typedAnswer, inputFeedbackStyle } = state;

    const units = useMemo(() => {
        const unitSet = new Set<string | number>();
        allWords.forEach(word => {
            if (word.unit) unitSet.add(word.unit);
        });
        return Array.from(unitSet).sort((a, b) => Number(a) - Number(b));
    }, [allWords]);
    
    const generateMultipleChoiceOptions = useCallback((correctWord: Word, allWordsForOptions: Word[]) => {
        let incorrectMeaningPool = shuffleArray(
            allWordsForOptions
                .filter(w => w.id !== correctWord.id)
                .map(w => w.meaning.split('/')[0].trim())
        );
        const uniqueIncorrectOptions = Array.from(new Set(incorrectMeaningPool)).slice(0, 3);
        
        while (uniqueIncorrectOptions.length < 3) {
            uniqueIncorrectOptions.push(`오답${uniqueIncorrectOptions.length + 1}`);
        }

        return shuffleArray([correctWord.meaning.split('/')[0].trim(), ...uniqueIncorrectOptions]);
    }, []);

    const setupQuestion = useCallback((index: number, wordsForQuiz: Word[], allWordsForOptions: Word[]) => {
        if (index >= wordsForQuiz.length) return { options: [] };
        const currentWord = wordsForQuiz[index];
        const newOptions = quizType === 'multiple' ? generateMultipleChoiceOptions(currentWord, allWordsForOptions) : [];
        if (userSettings.autoPlayAudio) {
            speak(currentWord.term, undefined, userSettings.speechRate);
        }
        return { options: newOptions };
    }, [quizType, generateMultipleChoiceOptions, userSettings.autoPlayAudio, userSettings.speechRate]);
    
    const startQuiz = () => {
        if (!selectedUnit) {
            addToast("퀴즈를 시작할 모드를 선택해주세요.", "warning");
            return;
        }

        let wordsForQuiz: Word[];
        let optionSourceWords: Word[];

        if (selectedUnit === 'all') {
            wordsForQuiz = shuffleArray(allWords).slice(0, 10);
            optionSourceWords = allWords;
        } else {
            wordsForQuiz = shuffleArray(allWords.filter(w => String(w.unit) === String(selectedUnit))).slice(0, 10);
            optionSourceWords = allWords.filter(w => String(w.unit) === String(selectedUnit));
        }

        if (optionSourceWords.length < 4 && quizType === 'multiple') {
            addToast("객관식 퀴즈를 위해 최소 4개의 단어가 필요합니다.", "warning");
            return;
        }
        if (wordsForQuiz.length === 0) {
            addToast("퀴즈를 진행할 단어가 없습니다.", "warning");
            return;
        }
        
        const { options } = setupQuestion(0, wordsForQuiz, optionSourceWords);
        dispatch({ type: 'START_QUIZ', payload: { quizWords: wordsForQuiz, options } });
    };

    const handleNextQuestion = () => {
        if (currentQuestionIndex < quizWords.length - 1) {
            const optionSourceWords = selectedUnit === 'all' ? allWords : allWords.filter(w => String(w.unit) === String(selectedUnit));
            const { options } = setupQuestion(currentQuestionIndex + 1, quizWords, optionSourceWords);
            dispatch({ type: 'NEXT_QUESTION', payload: { options } });
        } else {
            dispatch({ type: 'FINISH_QUIZ' });
        }
    };
    
    const handleMultipleChoiceSubmit = (option: string) => {
        if (showResult) return;
        const currentWord = quizWords[currentQuestionIndex];
        const correctAnswers = currentWord.meaning.split('/').map(m => m.trim());
        const isCorrect = correctAnswers.includes(option);

        dispatch({ type: 'SUBMIT_MULTIPLE_CHOICE', payload: { selectedAnswer: option, isCorrect, word: currentWord } });

        if (!isCorrect) {
            updateWordStat(currentWord.id, { quizIncorrectCount: (wordStats[currentWord.id]?.quizIncorrectCount || 0) + 1 });
        }
    };
    
    const handleTypingSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (showResult) { // If result is shown, this button acts as "Next"
            handleNextQuestion();
            return;
        }
        const currentWord = quizWords[currentQuestionIndex];
        const correctAnswers = currentWord.meaning.split('/').map(m => m.trim());
        const isCorrect = correctAnswers.includes(typedAnswer.trim());

        dispatch({ type: 'SUBMIT_TYPING', payload: { isCorrect, word: currentWord } });

        if (!isCorrect) {
            updateWordStat(currentWord.id, { quizIncorrectCount: (wordStats[currentWord.id]?.quizIncorrectCount || 0) + 1 });
            addToast(`오답! 정답: ${correctAnswers.join(', ')}`, 'error');
        }
    };


    if (quizState === 'setup') {
        return (
            <div className="p-4 sm:p-8 flex flex-col items-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">퀴즈 설정</h1>
                <div className="w-full max-w-md bg-slate-100 dark:bg-slate-700 p-6 rounded-lg shadow-lg space-y-6">
                    <div>
                        <label htmlFor="unit-select" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">모드 선택</label>
                        <select
                            id="unit-select"
                            value={String(selectedUnit)}
                            onChange={(e) => dispatch({ type: 'CHANGE_SETUP', payload: { key: 'selectedUnit', value: e.target.value } })}
                            className="w-full p-3 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500"
                        >
                            <option value="all">전체 단어 (랜덤 10문제)</option>
                            <optgroup label="단원별 퀴즈">
                                {units.map(unit => <option key={unit} value={unit}>단원 {unit}</option>)}
                            </optgroup>
                        </select>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">퀴즈 유형 선택</span>
                        <div className="flex space-x-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="radio" name="quizType" value="multiple" checked={quizType === 'multiple'} onChange={() => dispatch({ type: 'CHANGE_SETUP', payload: { key: 'quizType', value: 'multiple' } })} className="form-radio text-cyan-500 focus:ring-cyan-500"/>
                                <span className="text-slate-700 dark:text-slate-300">객관식 (4지선다)</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="radio" name="quizType" value="typing" checked={quizType === 'typing'} onChange={() => dispatch({ type: 'CHANGE_SETUP', payload: { key: 'quizType', value: 'typing' } })} className="form-radio text-cyan-500 focus:ring-cyan-500"/>
                                <span className="text-slate-700 dark:text-slate-300">주관식 (뜻 입력)</span>
                            </label>
                        </div>
                    </div>
                    <button onClick={startQuiz} className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md">
                        퀴즈 시작
                    </button>
                </div>
            </div>
        );
    }
    
    if (quizState === 'finished') {
        const accuracy = quizWords.length > 0 ? (score / quizWords.length) * 100 : 0;
        return (
            <div className="p-8 text-center">
                <h2 className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-4">퀴즈 완료! 🏆</h2>
                <p className="text-xl text-slate-700 dark:text-slate-200 mb-2">
                    총 {quizWords.length}문제 중 <span className="text-green-500 font-bold">{score}</span>문제를 맞혔습니다.
                </p>
                <p className="text-lg text-slate-600 dark:text-slate-300 mb-6">정답률: {accuracy.toFixed(1)}%</p>
                
                {incorrectlyAnsweredWords.length > 0 && (
                    <div className="mb-6 bg-slate-100 dark:bg-slate-700 p-4 rounded-lg max-w-md mx-auto">
                        <h3 className="text-lg font-semibold text-red-500 dark:text-red-400 mb-2">틀린 단어들:</h3>
                        <ul className="space-y-1 text-left">
                            {incorrectlyAnsweredWords.map(word => (
                                <li key={word.id} className="text-slate-700 dark:text-slate-300">
                                    <span className="font-semibold">{word.term}</span> - {word.meaning}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <div className="space-x-4">
                    <button
                        onClick={() => dispatch({ type: 'RESTART_QUIZ' })}
                        className="py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md"
                    >
                        다른 퀴즈 풀기
                    </button>
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className="py-3 px-6 bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg shadow-md"
                    >
                        대시보드로
                    </button>
                </div>
            </div>
        );
    }
    
    const currentWord = quizWords[currentQuestionIndex];
    if (!currentWord) {
        return <div className="p-8 text-center text-slate-600 dark:text-slate-300">퀴즈 단어 로딩 중...</div>;
    }

    const correctAnswers = currentWord.meaning.split('/').map(m => m.trim());
    
    return (
        <div className="p-4 sm:p-8 flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">퀴즈 ({currentQuestionIndex + 1} / {quizWords.length})</h1>
            <div className="w-full max-w-xl bg-slate-100 dark:bg-slate-700 rounded-xl shadow-2xl p-6 sm:p-8">
                <div className="text-center mb-6">
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">다음 단어의 뜻은 무엇일까요?</p>
                    <h2 className="text-4xl sm:text-5xl font-bold text-slate-800 dark:text-white">{currentWord.term}</h2>
                </div>

                {quizType === 'multiple' ? (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
                            {options.map((option, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleMultipleChoiceSubmit(option)}
                                    disabled={showResult}
                                    className={`w-full p-3 sm:p-4 text-left rounded-lg shadow-md transition-all duration-150 ease-in-out
                                        ${showResult
                                            ? correctAnswers.includes(option)
                                                ? 'bg-green-500 text-white ring-2 ring-green-300 scale-105'
                                                : selectedAnswer === option
                                                    ? 'bg-red-500 text-white ring-2 ring-red-300' 
                                                    : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300 opacity-70'
                                            : 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-white hover:bg-cyan-600 dark:hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:focus:ring-cyan-500 hover:text-white dark:hover:text-white'
                                        }`}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                        {showResult && (
                             <button
                                onClick={handleNextQuestion}
                                className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-md shadow-lg"
                            >
                                {currentQuestionIndex === quizWords.length - 1 ? '결과 보기' : '다음 문제'}
                            </button>
                        )}
                    </>
                ) : ( // Typing quiz
                    <form onSubmit={handleTypingSubmit}>
                        <input
                            type="text"
                            value={typedAnswer}
                            onChange={(e) => dispatch({ type: 'CHANGE_SETUP', payload: { key: 'typedAnswer', value: e.target.value } })}
                            className={`w-full p-4 text-center text-xl bg-white dark:bg-slate-600 text-slate-900 dark:text-white rounded-md border-2 shadow-inner transition-all ${showResult ? (correctAnswers.includes(typedAnswer.trim()) ? 'border-green-500 ring-2 ring-green-500' : 'border-red-500 ring-2 ring-red-500') : inputFeedbackStyle}`}
                            placeholder="정답을 입력하세요"
                            autoFocus
                            readOnly={showResult}
                        />
                         {showResult && (
                            <div className="mt-2 text-center text-lg">
                                {correctAnswers.includes(typedAnswer.trim()) ? (
                                    <p className="text-green-600 dark:text-green-400 font-semibold">정답입니다!</p>
                                ) : (
                                    <p className="text-red-600 dark:text-red-400 font-semibold">오답! 정답: {correctAnswers.join(', ')}</p>
                                )}
                            </div>
                        )}
                        <button type="submit" className="w-full mt-4 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md">
                            {showResult ? (currentQuestionIndex === quizWords.length - 1 ? '결과 보기' : '다음 문제') : '확인'}
                        </button>
                    </form>
                )}
            </div>
             <button onClick={() => onNavigate('dashboard')} className="mt-8 text-sm text-cyan-600 dark:text-cyan-400 hover:underline">
                퀴즈 중단하고 대시보드로
            </button>
        </div>
    );
};


// Shared EditWordModal Component (Memoized)
const EditWordModal = React.memo(({ 
    word, 
    onSave, 
    onCancel, 
    isCustomWordOnly, 
}: { 
    word: Word, 
    onSave: (updatedWord: Word) => Promise<{success: boolean}>, 
    onCancel: () => void, 
    isCustomWordOnly?: boolean, 
}) => {
    const { addToast } = useToasts();
    const { setGlobalLoading } = useAppContext();
    const [editableWord, setEditableWord] = useState<Word>(JSON.parse(JSON.stringify(word))); 
    const [isFetchingModalAIDetails, setIsFetchingModalAIDetails] = useState(false);
    const [isFetchingModalAIImage, setIsFetchingModalAIImage] = useState(false);
    const [modalAiImage, setModalAiImage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setEditableWord(JSON.parse(JSON.stringify(word)));
        setModalAiImage(null); 
    }, [word]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEditableWord(prev => ({ ...prev, [name]: value }));
    };
    
    const handleAIFillDetails = async () => {
        if (!editableWord.term?.trim()) {
             addToast("AI로 정보를 가져올 단어를 입력해주세요.", "warning");
            return;
        }
        setIsFetchingModalAIDetails(true);
        const details = await generateWordDetailsWithGemini(editableWord.term.trim(), addToast, setGlobalLoading);
        if (details) {
            setEditableWord(prev => ({
                ...prev,
                term: details.term || prev.term,
                pronunciation: details.pronunciation || prev.pronunciation,
                meaning: details.meaning || prev.meaning,
                partOfSpeech: details.partOfSpeech || prev.partOfSpeech,
                exampleSentence: details.exampleSentence || prev.exampleSentence,
                exampleSentenceMeaning: details.exampleSentenceMeaning || prev.exampleSentenceMeaning,
            }));
        }
        setIsFetchingModalAIDetails(false);
    };

    const handleGenerateModalAiImage = async () => {
         if (!editableWord.term?.trim()) {
            addToast("AI 이미지를 생성할 단어를 입력해주세요.", "warning");
            return;
        }
        setIsFetchingModalAIImage(true);
        setModalAiImage(null);
        const imageData = await generateImageForWordWithGemini(editableWord.term.trim(), addToast, setGlobalLoading);
        if(imageData) {
            setModalAiImage(`data:image/jpeg;base64,${imageData}`);
        }
        setIsFetchingModalAIImage(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        await onSave(editableWord);
        setIsSubmitting(false); 
    };
    
    const canEditFields = word.isCustom || !isCustomWordOnly;
    const missingApiKey = !apiKey;
    const aiOperationsDisabledByKeyOrQuota = missingApiKey || isCurrentlyGeminiQuotaExhausted;
    const isAnyAIFetchingInProgress = isFetchingModalAIDetails || isFetchingModalAIImage;
    const isModalBusyWithActivity = isAnyAIFetchingInProgress || isSubmitting;

    const getAIOperationDisabledReasonText = (isForFillDetailsButton: boolean): string | null => {
        if (isForFillDetailsButton && !canEditFields) return "사용자 단어만 가능";
        if (missingApiKey) return "API Key 필요";
        if (isCurrentlyGeminiQuotaExhausted) return "Quota 소진";
        return null;
    };
    
    const fillDetailsActionDisabledReason = getAIOperationDisabledReasonText(true);
    const imageGenerationActionDisabledReason = getAIOperationDisabledReasonText(false);

    return (
        <div role="dialog" aria-modal="true" aria-labelledby={`edit-word-modal-title-${word.id}`} className="fixed inset-0 bg-slate-900/75 dark:bg-slate-900/80 flex justify-center items-center p-4 z-50 overflow-y-auto animate-fadeIn">
            <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg space-y-3 my-4 custom-scrollbar max-h-[90vh]">
                <h3 id={`edit-word-modal-title-${word.id}`} className="text-xl font-semibold text-cyan-600 dark:text-cyan-400">단어 {canEditFields ? '수정' : '세부정보'}: {word.term}</h3>
                <div>
                    <label htmlFor={`term-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">단어 (필수)</label>
                    <input type="text" name="term" id={`term-modal-${word.id}`} value={editableWord.term} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" required disabled={!canEditFields}/>
                </div>
                 <button
                    type="button"
                    onClick={handleAIFillDetails}
                    disabled={isModalBusyWithActivity || aiOperationsDisabledByKeyOrQuota || !canEditFields}
                    className="w-full my-1 py-2 px-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center text-sm"
                >
                    <span role="img" aria-label="ai" className="mr-2">✨</span>
                    {isFetchingModalAIDetails ? 'AI 정보 가져오는 중...' : 'AI로 나머지 정보 채우기'}
                    {fillDetailsActionDisabledReason && <span className="text-xs ml-1">({fillDetailsActionDisabledReason})</span>}
                </button>
                <div>
                    <label htmlFor={`meaning-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">뜻 (필수)</label>
                    <input type="text" name="meaning" id={`meaning-modal-${word.id}`} value={editableWord.meaning} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" required disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`partOfSpeech-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">품사 (필수)</label>
                    <input type="text" name="partOfSpeech" id={`partOfSpeech-modal-${word.id}`} value={editableWord.partOfSpeech} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" required disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`pronunciation-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">발음기호 (선택)</label>
                    <input type="text" name="pronunciation" id={`pronunciation-modal-${word.id}`} value={editableWord.pronunciation || ''} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`exampleSentence-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">예문 (필수)</label>
                    <textarea name="exampleSentence" id={`exampleSentence-modal-${word.id}`} value={editableWord.exampleSentence} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" rows={2} required disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`exampleSentenceMeaning-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">예문 뜻 (선택)</label>
                    <textarea name="exampleSentenceMeaning" id={`exampleSentenceMeaning-modal-${word.id}`} value={editableWord.exampleSentenceMeaning || ''} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" rows={2} disabled={!canEditFields}/>
                </div>
                 <div>
                    <label htmlFor={`gradeLevel-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">학년 (필수)</label>
                    <select name="gradeLevel" id={`gradeLevel-modal-${word.id}`} value={editableWord.gradeLevel} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" disabled={!canEditFields}>
                        <option value="middle1">중1</option>
                        <option value="middle2">중2</option>
                        <option value="middle3">중3</option>
                    </select>
                </div>

                <button
                    type="button"
                    onClick={handleGenerateModalAiImage}
                    disabled={isModalBusyWithActivity || aiOperationsDisabledByKeyOrQuota}
                    className="w-full my-1 py-2 px-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center text-sm"
                >
                    <span role="img" aria-label="ai image" className="mr-2">🎨</span>
                    {isFetchingModalAIImage ? 'AI 이미지 생성 중...' : 'AI 이미지 생성 보기'}
                    {imageGenerationActionDisabledReason && <span className="text-xs ml-1">({imageGenerationActionDisabledReason})</span>}
                </button>
                {isFetchingModalAIImage && <p className="text-purple-600 dark:text-purple-400 text-center text-sm">AI 이미지 로딩 중...</p>}
                {modalAiImage && (
                    <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-700 rounded-md animate-fadeIn">
                        <img src={modalAiImage} alt={`AI generated for ${editableWord.term}`} className="w-full max-w-xs mx-auto rounded shadow"/>
                    </div>
                )}

                <div className="flex justify-end space-x-3 pt-2">
                    <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded text-slate-700 dark:text-white">취소</button>
                    {canEditFields && <button type="submit" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded text-white" disabled={isModalBusyWithActivity}>
                      {isSubmitting ? '저장 중...' : '저장'}
                    </button>}
                </div>
            </form>
        </div>
    );
});

// AllWordsScreen WordRow component (Memoized)
interface WordRowProps {
  wordData: Word & { stat: WordStat };
  toggleMastered: (word: Word) => void;
  handleEditWord: (word: Word) => void;
  handleDeleteClick: (word: Word) => void;
}
const WordRow: React.FC<WordRowProps> = React.memo(({ wordData, toggleMastered, handleEditWord, handleDeleteClick }) => {
    const { userSettings } = useAppContext();
    const word = wordData; 
    return (
        <li className={`p-4 rounded-lg shadow transition-colors ${word.stat.isMastered ? 'bg-slate-200/70 dark:bg-slate-700/70 hover:bg-slate-300/70 dark:hover:bg-slate-600/70' : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className={`text-xl font-semibold ${word.stat.isMastered ? 'text-green-600 dark:text-green-400' : 'text-cyan-700 dark:text-cyan-300'}`}>
                        {word.term} 
                        {word.stat.isMastered && <span className="text-xs bg-green-500 text-white dark:text-slate-900 px-1.5 py-0.5 rounded-full ml-2">완료</span>}
                        {word.isCustom && !word.stat.isMastered && <span className="text-xs bg-yellow-500 text-slate-900 px-1.5 py-0.5 rounded-full ml-2">나의 단어</span>}
                        {word.isCustom && word.stat.isMastered && <span className="text-xs bg-yellow-500 text-slate-900 px-1.5 py-0.5 rounded-full ml-2">나의 단어</span>}
                        {word.unit && <span className="text-xs bg-blue-500 text-white dark:text-slate-900 px-1.5 py-0.5 rounded-full ml-2">Unit {word.unit}</span>}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{word.partOfSpeech} - {word.meaning}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">학년: {word.gradeLevel} | 복습: {word.stat.lastReviewed ? new Date(word.stat.lastReviewed).toLocaleDateString() : '안함'} | 오답: {word.stat.quizIncorrectCount}</p>
                </div>
                <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-1 flex-shrink-0 ml-2 items-end">
                    <button onClick={() => speak(word.term, undefined, userSettings.speechRate)} className="text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 text-xl p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500" aria-label={`${word.term} 발음 듣기`}>
                        🔊
                    </button>
                    <button 
                        onClick={() => toggleMastered(word)}
                        className={`p-1.5 rounded-md text-sm whitespace-nowrap ${word.stat.isMastered ? 'bg-slate-400 hover:bg-slate-500 text-slate-800 dark:text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                        aria-label={word.stat.isMastered ? `${word.term} 학습 필요로 표시` : `${word.term} 마스터함으로 표시`}
                    >
                        {word.stat.isMastered ? '🔄 학습 필요' : '✅ 완료'}
                    </button>
                    {word.isCustom ? (
                        <>
                            <button 
                                onClick={() => handleEditWord(word)} 
                                className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500 text-sm whitespace-nowrap"
                                aria-label={`${word.term} 수정`}
                            >✏️ 수정</button>
                            <button 
                                onClick={() => handleDeleteClick(word)} 
                                className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500 text-sm whitespace-nowrap"
                                aria-label={`${word.term} 삭제`}
                            >🗑️ 삭제</button>
                        </>
                    ) : (
                        <button 
                            onClick={() => handleEditWord(word)} 
                            className="text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500 text-sm whitespace-nowrap"
                            aria-label={`${word.term} 세부 정보 보기`}
                        >ℹ️ 정보</button>
                    )}
                </div>
            </div>
            {word.exampleSentence && (
                <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">예문 보기</summary>
                    <div className="mt-1 p-2 bg-slate-200 dark:bg-slate-600 rounded">
                        <p className="text-slate-700 dark:text-slate-200">{word.exampleSentence}</p>
                        {word.exampleSentenceMeaning && <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{word.exampleSentenceMeaning}</p>}
                    </div>
                </details>
            )}
        </li>
    );
});


// AllWords Screen Component
const AllWordsScreen: React.FC = () => {
    const { userSettings, allWords, wordStats, handleDeleteCustomWord, handleSaveCustomWord, updateWordStat } = useAppContext();
    const { addToast } = useToasts();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGrade, setFilterGrade] = useState<string>(userSettings.grade || 'all');
    const [filterUnit, setFilterUnit] = useState<string>('all');
    const [editingWord, setEditingWord] = useState<Word | null>(null);
    const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
    const [wordToDelete, setWordToDelete] = useState<Word | null>(null);
    
    const getWordStat = useCallback((wordId: string | number) => {
        return wordStats[wordId] || getDefaultWordStat(wordId);
    }, [wordStats]);

    const uniqueUnits = useMemo(() => {
        const units = new Set<string>();
        allWords.forEach(word => {
            if (word.unit) units.add(String(word.unit));
        });
        return Array.from(units).sort((a,b) => parseInt(a) - parseInt(b));
    }, [allWords]);

    const wordsToDisplay = useMemo(() => {
        return allWords
        .filter(word => filterGrade === 'all' || word.gradeLevel === filterGrade)
        .filter(word => filterUnit === 'all' || String(word.unit) === filterUnit)
        .filter(word => word.term.toLowerCase().includes(searchTerm.toLowerCase()) || word.meaning.toLowerCase().includes(searchTerm.toLowerCase()))
        .map(word => ({ ...word, stat: getWordStat(word.id) })) 
        .sort((a,b) => a.term.localeCompare(b.term));
    }, [allWords, filterGrade, filterUnit, searchTerm, getWordStat]);


    const handleEditWord = useCallback((word: Word) => {
        setEditingWord(JSON.parse(JSON.stringify(word))); 
    }, []);
    
    const handleSaveEdit = useCallback(async (updatedWord: Word): Promise<{success: boolean}> => {
        if (updatedWord.isCustom) {
            const result = await handleSaveCustomWord(updatedWord, updatedWord.gradeLevel, updatedWord.unit ? Number(updatedWord.unit) : undefined);
            if (result.success) {
                setEditingWord(null);
                addToast(`'${updatedWord.term}' 단어가 수정되었습니다.`, "success");
            } else {
                addToast(`단어 수정 실패: '${updatedWord.term}'은(는) 다른 단어와 중복될 수 없습니다.`, "error");
            }
            return result;
        } else {
            addToast("기본 제공 단어는 이 화면에서 직접 수정할 수 없습니다. '나의 단어'만 수정 가능합니다.", "info");
            setEditingWord(null);
            return { success: true };
        }
    }, [handleSaveCustomWord, addToast]);

    const handleDeleteClick = useCallback((word: Word) => {
        setWordToDelete(word);
        setShowConfirmDeleteModal(true);
    }, []);

    const confirmDelete = useCallback(() => {
        if(wordToDelete) {
            handleDeleteCustomWord(wordToDelete.id);
        }
        setShowConfirmDeleteModal(false);
        setWordToDelete(null);
    }, [wordToDelete, handleDeleteCustomWord]);

    const toggleMastered = useCallback((word: Word) => {
        const currentStat = getWordStat(word.id);
        updateWordStat(word.id, { isMastered: !currentStat.isMastered });
        addToast(
            `'${word.term}' 단어를 ${!currentStat.isMastered ? '완료' : '학습 필요'} 상태로 변경했습니다.`,
            !currentStat.isMastered ? "success" : "info"
        );
    }, [getWordStat, updateWordStat, addToast]);
    

    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">전체 단어 목록 ({wordsToDisplay.length}개)</h1>
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <input
                    type="text"
                    placeholder="단어 또는 뜻 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="sm:col-span-1 p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500"
                    aria-label="단어 검색"
                />
                <select
                    value={filterGrade}
                    onChange={(e) => setFilterGrade(e.target.value)}
                    className="p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500"
                    aria-label="학년 필터"
                >
                    <option value="all">모든 학년</option>
                    <option value="middle1">중학교 1학년</option>
                    <option value="middle2">중학교 2학년</option>
                    <option value="middle3">중학교 3학년</option>
                </select>
                <select
                    value={filterUnit}
                    onChange={(e) => setFilterUnit(e.target.value)}
                    className="p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500"
                    aria-label="단원 필터"
                >
                    <option value="all">모든 단원</option>
                    {uniqueUnits.map(unit => <option key={unit} value={unit}>Unit {unit}</option>)}
                </select>
            </div>

            {wordsToDisplay.length > 0 ? (
                <ul className="space-y-3">
                    {wordsToDisplay.map((word) => (
                       <WordRow
                            key={word.id}
                            wordData={word}
                            toggleMastered={toggleMastered}
                            handleEditWord={handleEditWord}
                            handleDeleteClick={handleDeleteClick}
                        />
                    ))}
                </ul>
            ) : (
                <p className="text-center text-slate-500 dark:text-slate-400 py-8">해당 조건에 맞는 단어가 없습니다.</p>
            )}
            {editingWord && <EditWordModal word={editingWord} onSave={handleSaveEdit} onCancel={() => setEditingWord(null)} isCustomWordOnly={!editingWord.isCustom} />}
            {wordToDelete && (
                <ConfirmationModal
                    isOpen={showConfirmDeleteModal}
                    title="단어 삭제 확인"
                    message={`'${wordToDelete.term}' 단어를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
                    onConfirm={confirmDelete}
                    onCancel={() => { setShowConfirmDeleteModal(false); setWordToDelete(null); }}
                />
            )}
        </div>
    );
};

// Stats Screen Component
const StatsScreen: React.FC = () => {
    const { userSettings, allWords, wordStats, memoizedStats } = useAppContext();
    const { addToast } = useToasts();
    
    const totalWords = allWords.length;
    const customWordsCount = allWords.filter(w => w.isCustom).length;
    const masteredWordsCount = Object.values(wordStats).filter(stat => stat.isMastered).length;
    
    const wordsByGrade = useMemo(() => {
        const counts: Record<string, number> = { middle1: 0, middle2: 0, middle3: 0 };
        allWords.forEach(word => {
            if (counts[word.gradeLevel] !== undefined) {
                counts[word.gradeLevel]++;
            }
        });
        return counts;
    }, [allWords]);

    const wordsByUnit = useMemo(() => {
        const units: Record<string, number> = {};
        allWords.forEach(word => {
            if(word.unit){
                const unitKey = `Unit ${word.unit}`;
                units[unitKey] = (units[unitKey] || 0) + 1;
            }
        });
        return Object.entries(units).sort((a,b) => parseInt(a[0].replace("Unit ","")) - parseInt(b[0].replace("Unit ","")));
    }, [allWords]);


    const renderStatCard = (title: string, value: string | number, subtext?: string, icon?: string) => (
        <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg text-center">
            {icon && <div className="text-3xl mb-2">{icon}</div>}
            <h3 className="text-lg font-semibold text-cyan-600 dark:text-cyan-400">{title}</h3>
            <p className="text-3xl font-bold text-slate-800 dark:text-white">{value}</p>
            {subtext && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtext}</p>}
        </div>
    );
    
    return (
        <div className="p-4 sm:p-6 space-y-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400">학습 통계</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {renderStatCard("총 단어 수", totalWords, `(나의 단어: ${customWordsCount}개)`, "📚")}
                {renderStatCard("마스터한 단어", masteredWordsCount, `${totalWords > 0 ? ((masteredWordsCount/totalWords)*100).toFixed(1) : 0}% 완료`, "🏆")}
                {renderStatCard("오늘 학습한 단어", memoizedStats.learnedWordsToday, `일일 목표: ${userSettings.dailyGoal}개`, "📈")}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderStatCard("연속 학습일", `${memoizedStats.learningStreak.currentStreak}일`, `최고 기록: ${memoizedStats.learningStreak.bestStreak}일`, "🔥")}
                {renderStatCard("평균 퀴즈 점수", `${memoizedStats.averageQuizScore.toFixed(1)}%`, undefined, "🎯")}
            </div>

            <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold text-cyan-600 dark:text-cyan-400 mb-3">학년별 단어 분포</h3>
                 <div className="flex justify-around items-end h-32 bg-slate-200 dark:bg-slate-600 p-2 rounded">
                    {Object.entries(wordsByGrade).map(([grade, count]) => {
                        const maxCount = Math.max(...Object.values(wordsByGrade), 1);
                        const heightPercentage = (count / maxCount) * 100;
                        return (
                            <div key={grade} className="flex flex-col items-center w-1/4">
                                <div 
                                    className="w-10 bg-cyan-500 rounded-t-sm" 
                                    style={{ height: `${heightPercentage}%` }}
                                    title={`${grade}: ${count}개`}
                                ></div>
                                <p className="text-xs mt-1 text-slate-700 dark:text-slate-300">{grade.replace('middle', '중')}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {wordsByUnit.length > 0 && (
                <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold text-cyan-600 dark:text-cyan-400 mb-3">단원별 단어 수</h3>
                    <ul className="max-h-48 overflow-y-auto custom-scrollbar space-y-1 text-sm">
                        {wordsByUnit.map(([unit, count]) => (
                            <li key={unit} className="flex justify-between p-1.5 bg-slate-200 dark:bg-slate-600 rounded-md">
                                <span className="text-slate-700 dark:text-slate-300">{unit}</span>
                                <span className="font-semibold text-cyan-700 dark:text-cyan-300">{count}개</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
             <button
                onClick={() => addToast("데이터 내보내기 기능은 준비 중입니다.", "info")}
                className="w-full mt-4 py-2 px-4 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-md shadow-md"
            >
                학습 데이터 내보내기 (준비 중)
            </button>
        </div>
    );
};


// ManageWords Screen Component
const ManageWordsScreen: React.FC = () => {
    const { userSettings, onNavigate, handleSaveCustomWord, setGlobalLoading } = useAppContext();
    const { addToast } = useToasts();

    const [newWord, setNewWord] = useState<Partial<Word>>({ term: '', meaning: '', partOfSpeech: '', exampleSentence: '', gradeLevel: userSettings.grade, isCustom: true, unit: undefined });
    const [isAddingViaAI, setIsAddingViaAI] = useState(false);
    const [isSubmittingManual, setIsSubmittingManual] = useState(false);
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === "unit") {
            setNewWord(prev => ({ ...prev, [name]: value === "" ? undefined : Number(value) }));
        } else {
            setNewWord(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAIFill = async () => {
        if (!newWord.term?.trim()) {
            addToast("AI로 정보를 가져올 단어를 입력해주세요.", "warning");
            return;
        }
        setIsAddingViaAI(true);
        const details = await generateWordDetailsWithGemini(newWord.term.trim(), addToast, setGlobalLoading);
        if (details) {
            setNewWord(prev => ({
                ...prev,
                term: details.term || prev.term, // Use corrected term if AI provides one
                pronunciation: details.pronunciation || '',
                meaning: details.meaning || '',
                partOfSpeech: details.partOfSpeech || '',
                exampleSentence: details.exampleSentence || '',
                exampleSentenceMeaning: details.exampleSentenceMeaning || '',
            }));
        }
        setIsAddingViaAI(false);
    };

    const handleAddWord = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newWord.term || !newWord.meaning || !newWord.partOfSpeech || !newWord.exampleSentence) {
            addToast("필수 필드(단어, 뜻, 품사, 예문)를 모두 입력해주세요.", "error");
            return;
        }
        setIsSubmittingManual(true);
        const unitNumber = newWord.unit ? Number(newWord.unit) : undefined;
        const result = await handleSaveCustomWord(newWord, newWord.gradeLevel, unitNumber);
        if (result.success) {
            setNewWord({ term: '', meaning: '', partOfSpeech: '', exampleSentence: '', gradeLevel: userSettings.grade, isCustom: true, unit: undefined }); 
            addToast(`'${newWord.term}' 단어가 성공적으로 추가되었습니다.`, "success");
        } else {
             addToast(`단어 '${newWord.term}' 추가에 실패했습니다. 이미 존재하는 단어일 수 있습니다.`, "error");
        }
        setIsSubmittingManual(false);
    };
    
    const canUseAI = apiKey && !isCurrentlyGeminiQuotaExhausted;
    const aiButtonDisabledReason = !apiKey ? "(API Key 필요)" : isCurrentlyGeminiQuotaExhausted ? "(Quota 소진)" : "";

    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">나의 단어 추가</h1>
            
            <form onSubmit={handleAddWord} className="bg-slate-100 dark:bg-slate-700 p-6 rounded-lg shadow-lg space-y-4 mb-8">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white">새 단어 추가</h2>
                <div>
                    <label htmlFor="term" className="block text-sm font-medium text-slate-700 dark:text-slate-300">단어 (필수)</label>
                    <input type="text" name="term" id="term" value={newWord.term || ''} onChange={handleInputChange} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" required />
                </div>
                <button 
                    type="button" 
                    onClick={handleAIFill} 
                    disabled={!canUseAI || isAddingViaAI || isSubmittingManual || !newWord.term?.trim()}
                    className="w-full py-2 px-4 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center"
                >
                    <span role="img" aria-label="ai" className="mr-2">✨</span> 
                    {isAddingViaAI ? 'AI 정보 가져오는 중...' : `AI로 나머지 정보 채우기 ${aiButtonDisabledReason}`}
                </button>
                <div>
                    <label htmlFor="meaning" className="block text-sm font-medium text-slate-700 dark:text-slate-300">뜻 (필수)</label>
                    <input type="text" name="meaning" id="meaning" value={newWord.meaning || ''} onChange={handleInputChange} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" required />
                </div>
                 <div>
                    <label htmlFor="partOfSpeech" className="block text-sm font-medium text-slate-700 dark:text-slate-300">품사 (필수)</label>
                    <input type="text" name="partOfSpeech" id="partOfSpeech" value={newWord.partOfSpeech || ''} onChange={handleInputChange} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" required />
                </div>
                <div>
                    <label htmlFor="pronunciation" className="block text-sm font-medium text-slate-700 dark:text-slate-300">발음기호 (선택)</label>
                    <input type="text" name="pronunciation" id="pronunciation" value={newWord.pronunciation || ''} onChange={handleInputChange} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" />
                </div>
                <div>
                    <label htmlFor="exampleSentence" className="block text-sm font-medium text-slate-700 dark:text-slate-300">예문 (필수)</label>
                    <textarea name="exampleSentence" id="exampleSentence" value={newWord.exampleSentence || ''} onChange={handleInputChange} rows={2} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" required></textarea>
                </div>
                 <div>
                    <label htmlFor="exampleSentenceMeaning" className="block text-sm font-medium text-slate-700 dark:text-slate-300">예문 뜻 (선택)</label>
                    <textarea name="exampleSentenceMeaning" id="exampleSentenceMeaning" value={newWord.exampleSentenceMeaning || ''} onChange={handleInputChange} rows={2} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm"></textarea>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="gradeLevel" className="block text-sm font-medium text-slate-700 dark:text-slate-300">학년 (필수)</label>
                        <select name="gradeLevel" id="gradeLevel" value={newWord.gradeLevel} onChange={handleInputChange} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm">
                            <option value="middle1">중1</option>
                            <option value="middle2">중2</option>
                            <option value="middle3">중3</option>
                        </select>
                    </div>
                     <div>
                        <label htmlFor="unit" className="block text-sm font-medium text-slate-700 dark:text-slate-300">단원 번호 (선택)</label>
                        <input type="number" name="unit" id="unit" value={newWord.unit === undefined ? '' : newWord.unit} onChange={handleInputChange} min="1" step="1" placeholder="예: 1" className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" />
                    </div>
                </div>
                <button 
                    type="submit" 
                    disabled={isAddingViaAI || isSubmittingManual}
                    className="w-full py-2 px-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50"
                >
                    {isSubmittingManual ? '추가 중...' : '수동으로 단어 추가'}
                </button>
            </form>

            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                '전체 단어' 목록에서 사용자 추가 단어(나의 단어)를 수정하거나 삭제할 수 있습니다.
                <button onClick={() => onNavigate('allWords')} className="ml-2 text-cyan-600 dark:text-cyan-400 hover:underline">전체 단어 목록으로 이동</button>
            </p>
        </div>
    );
};


// --- AI Tutor Chat Screen ---
interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

const TutorChatScreen: React.FC = () => {
    const { setGlobalLoading } = useAppContext();
    const { addToast } = useToasts();
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const initializeChat = useCallback(() => {
        if (!ai) return;
        const systemInstruction = `You are a friendly and encouraging AI tutor specializing in English for Korean middle school students. Your name is 'VocaTutor'. 
        Always respond in Korean, unless the user specifically asks for English text.
        Keep your answers concise, clear, and easy to understand for a young learner. 
        Use emojis to make the conversation more engaging. 
        When explaining grammar or vocabulary, provide simple examples. 
        Your goal is to help students learn English in a fun and supportive way. Start the first message with a friendly greeting introducing yourself as VocaTutor.`;
        
        const newChat = ai.chats.create({
            model: 'gemini-2.5-flash-preview-04-17',
            config: {
                systemInstruction,
            },
        });
        setChat(newChat);
    }, []);

    // Initial greeting from AI
    useEffect(() => {
        initializeChat();
        setMessages([{ role: 'model', text: '안녕하세요! 저는 여러분의 영어 학습을 도와줄 AI 튜터, VocaTutor예요. 무엇이든 물어보세요! 😊' }]);
    }, [initializeChat]);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleNewChat = () => {
        initializeChat();
        setMessages([{ role: 'model', text: '새로운 대화를 시작합니다! 영어에 대해 궁금한 점이 있나요? ✍️' }]);
        addToast("새로운 대화를 시작했어요.", "info");
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedInput = userInput.trim();
        if (!trimmedInput || isLoading || !chat) return;

        setUserInput('');
        setMessages(prev => [...prev, { role: 'user', text: trimmedInput }]);
        setIsLoading(true);
        setGlobalLoading(true);

        try {
            const stream = await chat.sendMessageStream({ message: trimmedInput });
            let accumulatedText = '';
            setMessages(prev => [...prev, { role: 'model', text: '...' }]); // Placeholder

            for await (const chunk of stream) {
                accumulatedText += chunk.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { role: 'model', text: accumulatedText };
                    return newMessages;
                });
            }
        } catch (error: any) {
            console.error("AI Tutor chat error:", error);
            const { displayErrorMsg } = parseGeminiError(error);
            addToast(`AI 튜터와의 대화 중 오류가 발생했습니다: ${displayErrorMsg}`, "error");
            setMessages(prev => prev.slice(0, -1)); // Remove placeholder
        } finally {
            setIsLoading(false);
            setGlobalLoading(false);
        }
    };

    if (!ai) {
        return (
            <div className="p-8 text-center text-slate-600 dark:text-slate-300">
                AI 튜터 기능을 사용하려면 API 키가 필요합니다.
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] p-4 sm:p-6 bg-slate-50 dark:bg-slate-900">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400">💬 AI 튜터</h1>
                <button
                    onClick={handleNewChat}
                    className="py-2 px-4 bg-slate-500 hover:bg-slate-600 text-white text-sm font-semibold rounded-lg shadow-md transition-colors"
                >
                    새로운 대화 시작
                </button>
            </div>

            <div ref={chatContainerRef} className="flex-grow p-4 bg-white dark:bg-slate-800 rounded-lg shadow-inner overflow-y-auto custom-scrollbar space-y-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs md:max-w-md lg:max-w-2xl p-3 rounded-lg shadow ${
                            msg.role === 'user' 
                                ? 'bg-cyan-500 text-white' 
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white'
                        }`}>
                            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.text}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="max-w-xs md:max-w-md lg:max-w-2xl p-3 rounded-lg shadow bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white">
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <form onSubmit={handleSendMessage} className="mt-4 flex items-center space-x-2">
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="AI 튜터에게 질문해보세요..."
                    className="w-full p-3 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg border-2 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    className="py-3 px-5 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md disabled:opacity-50"
                    disabled={isLoading || !userInput.trim()}
                >
                    전송
                </button>
            </form>
        </div>
    );
};


// --- Game Mode Screens ---
// GameSelectionScreen
const GameSelectionScreen: React.FC = () => {
    const { onNavigate } = useAppContext();
    const { addToast } = useToasts();
    
    const games = [
        { id: 'wordMatchGame', name: '짝맞추기 게임', description: '단어와 뜻을 빠르게 연결하세요!', icon: '🔗', screen: 'wordMatchGame' as AppScreen, isReady: true},
        { id: 'typingPracticeGame', name: '타자 연습 게임', description: '단어를 정확하고 빠르게 입력해보세요.', icon: '⌨️', screen: 'typingPracticeGame' as AppScreen, isReady: true },
        { id: 'speedQuizGame', name: '스피드 퀴즈', description: '제한 시간 내에 많은 문제를 풀어보세요!', icon: '⏱️', screen: 'speedQuizGame' as AppScreen, isReady: true },
        { id: 'wordShooterGame', name: '뜻 사격 게임', description: '떨어지는 단어 중 올바른 것을 맞추세요!', icon: '🎯', screen: 'wordShooterGame' as AppScreen, isReady: true },
        { id: 'wordBombGame', name: '단어 폭탄 제거', description: '떨어지는 폭탄의 뜻을 보고 단어를 입력하여 제거하세요!', icon: '💣', screen: 'wordBombGame' as AppScreen, isReady: true },
        { id: 'wordZombieDefense', name: '단어 좀비 디펜스', description: '단어의 뜻을 보고 좀비를 막아내세요!', icon: '🧟', screen: 'wordZombieDefense' as AppScreen, isReady: true },
        { id: 'wordPuzzleSlideGame', name: '뜻 맞추기 퍼즐', description: '단어와 뜻, 예문을 순서대로 조합하세요!', icon: '🧩', screen: 'wordPuzzleSlideGame' as AppScreen, isReady: true },
    ];

    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6 text-center">🎮 게임 모드 선택</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {games.map(game => (
                    <button
                        key={game.id}
                        onClick={() => {
                            if (!game.isReady) {
                                addToast(`${game.name}은 준비 중입니다.`, "info");
                            } else {
                                onNavigate(game.screen);
                            }
                        }}
                        className={`bg-slate-100 dark:bg-slate-700 p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 text-center
                                     ${!game.isReady ? 'opacity-60 cursor-not-allowed' : 'hover:ring-2 hover:ring-cyan-500 dark:hover:ring-cyan-400'}`}
                        aria-label={game.name}
                        disabled={!game.isReady}
                    >
                        <div className="text-4xl mb-3">{game.icon}</div>
                        <h2 className="text-xl font-semibold text-cyan-700 dark:text-cyan-300 mb-2">{game.name}</h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{game.description}</p>
                        {!game.isReady && <span className="mt-2 inline-block text-xs bg-yellow-400 text-slate-800 px-2 py-0.5 rounded-full">준비 중</span>}
                    </button>
                ))}
            </div>
        </div>
    );
};


// WordMatchGame
// Define specific types for options in the game
type TermOption = Word & { id: string; type: 'term' }; // id will be 'term-originalId'
type MeaningOption = { meaning: string; id: string; originalWordId: string | number; type: 'meaning' }; // id will be 'meaning-originalId'
type GameOption = TermOption | MeaningOption;

const WordMatchGame: React.FC = () => {
    const { allWords, onNavigate, handleGameComplete } = useAppContext();
    const { addToast } = useToasts();
    
    const [gameState, setGameState] = useState<'setup' | 'playing'>('setup');
    const [selectedUnit, setSelectedUnit] = useState<string|number>('all');
    
    const [gameWords, setGameWords] = useState<Word[]>([]);
    const [options, setOptions] = useState<GameOption[]>([]);
    const [selectedTerm, setSelectedTerm] = useState<TermOption | null>(null);
    const [selectedMeaning, setSelectedMeaning] = useState<MeaningOption | null>(null);
    const [matchedPairs, setMatchedPairs] = useState<string[]>([]); // Stores string IDs of matched options
    const [incorrectAttempts, setIncorrectAttempts] = useState(0);
    const [startTime, setStartTime] = useState<number | null>(null);
    
    const NUM_PAIRS = 8;

    const units = useMemo(() => {
        const unitSet = new Set<string | number>();
        allWords.forEach(word => {
            if (word.unit) unitSet.add(word.unit);
        });
        return Array.from(unitSet).sort((a, b) => Number(a) - Number(b));
    }, [allWords]);

    const initializeGame = useCallback((wordsForGame: Word[]) => {
        const selectedGameWords = shuffleArray(wordsForGame).slice(0, NUM_PAIRS);
        setGameWords(selectedGameWords);
        
        const termsForOptions: TermOption[] = selectedGameWords.map(w => ({ ...w, id: `term-${w.id}`, type: 'term' }));
        const meaningsForOptions: MeaningOption[] = selectedGameWords.map(w => ({ meaning: w.meaning, id: `meaning-${w.id}`, originalWordId: w.id, type: 'meaning' }));
        
        setOptions(shuffleArray([...termsForOptions, ...meaningsForOptions]));
        setSelectedTerm(null);
        setSelectedMeaning(null);
        setMatchedPairs([]);
        setIncorrectAttempts(0);
        setStartTime(Date.now());
        setGameState('playing');
    }, []);

    const handleStartGame = () => {
        let sourceWords = [];
        if (selectedUnit === 'all') {
            sourceWords = allWords;
        } else {
            sourceWords = allWords.filter(w => String(w.unit) === String(selectedUnit));
        }

        if (sourceWords.length < NUM_PAIRS) {
            addToast(`짝맞추기 게임을 위해 단어가 최소 ${NUM_PAIRS}개 필요합니다. (현재: ${sourceWords.length}개)`, "warning");
            return;
        }
        initializeGame(sourceWords);
    };

    useEffect(() => {
        if (selectedTerm && selectedMeaning) {
            const originalIdFromTerm = selectedTerm.id.replace('term-', '');
            const originalIdFromMeaningOption = String(selectedMeaning.originalWordId);

            if (originalIdFromTerm === originalIdFromMeaningOption) { // Correct match
                const newMatchedPairs = [...matchedPairs, selectedTerm.id, selectedMeaning.id];
                setMatchedPairs(newMatchedPairs);
                setSelectedTerm(null);
                setSelectedMeaning(null);
                
                if (newMatchedPairs.length === gameWords.length * 2) {
                    const endTime = Date.now();
                    const timeTaken = Math.round((endTime - (startTime || endTime)) / 1000);
                    const score = Math.max(0, (gameWords.length * 10) - (incorrectAttempts * 2) - Math.floor(timeTaken / 10)); 
                    
                    handleGameComplete(score, gameWords.length, incorrectAttempts, timeTaken);
                    onNavigate('gameResult', { score, correct: gameWords.length, incorrect: incorrectAttempts, timeTaken, gameName: '짝맞추기 게임' });
                }
            } else { // Incorrect match
                addToast("땡! 다시 시도하세요.", "error");
                setIncorrectAttempts(prev => prev + 1);
                
                const termElement = document.getElementById(selectedTerm.id);
                const meaningElement = document.getElementById(selectedMeaning.id);
                termElement?.classList.add('animate-pulse', 'bg-red-300', 'dark:bg-red-700');
                meaningElement?.classList.add('animate-pulse', 'bg-red-300', 'dark:bg-red-700');
                setTimeout(() => {
                    termElement?.classList.remove('animate-pulse', 'bg-red-300', 'dark:bg-red-700');
                    meaningElement?.classList.remove('animate-pulse', 'bg-red-300', 'dark:bg-red-700');
                    setSelectedTerm(null);
                    setSelectedMeaning(null);
                }, 700);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTerm, selectedMeaning]);


    const handleOptionClick = (option: GameOption) => {
        if (matchedPairs.includes(option.id)) return;

        if (option.type === 'term') {
            setSelectedTerm(selectedTerm?.id === option.id ? null : option);
        } else { // option.type === 'meaning'
            setSelectedMeaning(selectedMeaning?.id === option.id ? null : option);
        }
    };
    
    if (gameState === 'setup') {
        return (
            <div className="p-4 sm:p-8 flex flex-col items-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">🔗 짝맞추기 게임 설정</h1>
                <div className="w-full max-w-md bg-slate-100 dark:bg-slate-700 p-6 rounded-lg shadow-lg space-y-6">
                    <div>
                        <label htmlFor="unit-select-match" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">모드 선택</label>
                        <select
                            id="unit-select-match"
                            value={String(selectedUnit)}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                            className="w-full p-3 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500"
                        >
                            <option value="all">전체 단어 ({NUM_PAIRS}쌍 랜덤)</option>
                            <optgroup label="단원별 게임">
                                {units.map(unit => <option key={unit} value={unit}>단원 {unit}</option>)}
                            </optgroup>
                        </select>
                    </div>
                    <button onClick={handleStartGame} className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md">
                        게임 시작
                    </button>
                </div>
            </div>
        );
    }
    
    if (gameState === 'playing') {
        return (
            <div className="p-4 sm:p-6 flex flex-col items-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-2">🔗 짝맞추기 게임</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">단어와 뜻을 연결하세요!</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">남은 짝: {gameWords.length - matchedPairs.length/2} | 틀린 횟수: {incorrectAttempts}</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full max-w-3xl">
                    {options.map(opt => (
                        <button
                            key={opt.id}
                            id={opt.id} 
                            onClick={() => handleOptionClick(opt)}
                            disabled={matchedPairs.includes(opt.id)}
                            className={`p-3 sm:p-4 rounded-lg shadow-md text-sm sm:text-base text-center break-all min-h-[60px] flex items-center justify-center
                                ${matchedPairs.includes(opt.id)
                                    ? 'bg-green-500 text-white cursor-default opacity-70'
                                    : (selectedTerm?.id === opt.id || selectedMeaning?.id === opt.id)
                                        ? 'bg-yellow-400 dark:bg-yellow-600 text-slate-900 dark:text-white ring-2 ring-yellow-500'
                                        : 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-white hover:bg-cyan-500 dark:hover:bg-cyan-400 hover:text-white'
                                }
                                transition-all duration-150 ease-in-out
                            `}
                        >
                            {opt.type === 'term' ? opt.term : opt.meaning}
                        </button>
                    ))}
                </div>
                 <button onClick={() => onNavigate('gameSelection')} className="mt-8 text-sm text-cyan-600 dark:text-cyan-400 hover:underline">다른 게임 선택</button>
            </div>
        );
    }

    return <div className="p-8 text-center text-slate-600 dark:text-slate-300">게임 데이터 로딩 중...</div>;
};


// GameResultScreen
interface GameResultScreenProps {
    routeParams?: any;
}
const GameResultScreen: React.FC<GameResultScreenProps> = ({ routeParams }) => {
    const { onNavigate } = useAppContext();
    const { score = 0, correct = 0, incorrect = 0, timeTaken = 0, gameName = "게임", wpm } = routeParams || {};

    return (
        <div className="p-4 sm:p-8 text-center flex flex-col items-center justify-center min-h-[calc(100vh-150px)] sm:min-h-0">
            <h1 className="text-3xl sm:text-4xl font-bold text-cyan-600 dark:text-cyan-400 mb-4">🎉 {gameName} 완료! 🎉</h1>
            <div className="bg-slate-100 dark:bg-slate-700 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md space-y-3">
                <p className="text-5xl font-bold text-yellow-500 dark:text-yellow-400">{score}점</p>
                <p className="text-lg text-slate-700 dark:text-slate-200">맞춘 개수: <span className="font-semibold text-green-500">{correct}</span></p>
                <p className="text-lg text-slate-700 dark:text-slate-200">틀린 횟수/단어: <span className="font-semibold text-red-500">{incorrect}</span></p>
                {timeTaken > 0 && <p className="text-lg text-slate-700 dark:text-slate-200">걸린 시간: <span className="font-semibold">{timeTaken}초</span></p>}
                {wpm !== undefined && <p className="text-lg text-slate-700 dark:text-slate-200">분당 타수 (WPM): <span className="font-semibold">{wpm}</span></p>}
                {score > 0 && <p className="text-md text-yellow-600 dark:text-yellow-300">✨ XP +{score} ✨</p>}
            </div>
            <div className="mt-8 space-x-4">
                <button
                    onClick={() => onNavigate('gameSelection')}
                    className="py-2 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md"
                >
                    다른 게임하기
                </button>
                <button
                    onClick={() => onNavigate('dashboard')}
                    className="py-2 px-6 bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg shadow-md"
                >
                    대시보드로
                </button>
            </div>
        </div>
    );
};


// TypingPracticeGame
interface WordInTypingGameInfo {
    originalWord: Word;
    submissions: number; 
    isCorrectlyTyped: boolean; 
    firstTryCorrect: boolean;
}

const TypingPracticeGame: React.FC = () => {
    const { allWords, onNavigate, handleGameComplete } = useAppContext();
    const { addToast } = useToasts();

    const [gameState, setGameState] = useState<'setup' | 'playing'>('setup');
    const [selectedUnit, setSelectedUnit] = useState<string|number>('all');
    
    const [gameWordsInfo, setGameWordsInfo] = useState<WordInTypingGameInfo[]>([]);
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [inputValue, setInputValue] = useState('');
    const [currentScore, setCurrentScore] = useState(0);
    const [gameStartTime, setGameStartTime] = useState<number | null>(null);
    const [inputFeedbackStyle, setInputFeedbackStyle] = useState('border-slate-300 dark:border-slate-500 focus:ring-cyan-500 focus:border-cyan-500');
    const inputRef = useRef<HTMLInputElement>(null);

    const MAX_WORDS_IN_GAME = 15;
    const MIN_WORDS_FOR_GAME = 5;

    const units = useMemo(() => {
        const unitSet = new Set<string | number>();
        allWords.forEach(word => {
            if (word.unit) unitSet.add(word.unit);
        });
        return Array.from(unitSet).sort((a, b) => Number(a) - Number(b));
    }, [allWords]);

    const initializeGame = useCallback((wordsForGame: Word[]) => {
        const selectedRawWords = shuffleArray(wordsForGame).slice(0, MAX_WORDS_IN_GAME);
        setGameWordsInfo(selectedRawWords.map(word => ({
            originalWord: word,
            submissions: 0,
            isCorrectlyTyped: false,
            firstTryCorrect: false
        })));
        setCurrentWordIndex(0);
        setInputValue('');
        setCurrentScore(0);
        setGameStartTime(Date.now());
        setInputFeedbackStyle('border-slate-300 dark:border-slate-500 focus:ring-cyan-500 focus:border-cyan-500');
        setGameState('playing');
    }, []);
    
    useEffect(() => {
        if(gameState === 'playing') {
            inputRef.current?.focus();
        }
    }, [gameState, currentWordIndex]);

    const handleStartGame = () => {
        const alphabetOnly = (term: string) => /^[a-zA-Z\s'-]+$/.test(term);
        let sourceWords: Word[] = [];
        if (selectedUnit === 'all') {
            sourceWords = allWords.filter(w => alphabetOnly(w.term));
        } else {
            sourceWords = allWords.filter(w => String(w.unit) === String(selectedUnit) && alphabetOnly(w.term));
        }

        if (sourceWords.length < MIN_WORDS_FOR_GAME) {
            addToast(`타자 연습을 위해 알파벳 단어가 최소 ${MIN_WORDS_FOR_GAME}개 필요합니다. (현재: ${sourceWords.length}개)`, "warning");
            return;
        }
        initializeGame(sourceWords);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        setInputFeedbackStyle('border-slate-300 dark:border-slate-500 focus:ring-cyan-500 focus:border-cyan-500');
    };

    const finishGame = useCallback(() => {
        const endTime = Date.now();
        const timeTaken = Math.round((endTime - (gameStartTime || endTime)) / 1000);
        const correctWords = gameWordsInfo.filter(w => w.isCorrectlyTyped).length;
        const incorrectWords = gameWordsInfo.length - correctWords;
        
        const correctlyTypedChars = gameWordsInfo
            .filter(w => w.isCorrectlyTyped)
            .reduce((acc, word) => acc + word.originalWord.term.length, 0);
            
        const timeInMinutes = timeTaken / 60;
        const wpm = timeInMinutes > 0 ? Math.round((correctlyTypedChars / 5) / timeInMinutes) : 0;
        
        handleGameComplete(currentScore, correctWords, incorrectWords, timeTaken);
        onNavigate('gameResult', { score: currentScore, correct: correctWords, incorrect: incorrectWords, timeTaken, gameName: '타자 연습 게임', wpm });
    }, [gameStartTime, currentScore, gameWordsInfo, handleGameComplete, onNavigate]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (gameState !== 'playing' || !gameWordsInfo[currentWordIndex]) return;

        const currentWordInfo = gameWordsInfo[currentWordIndex];
        const isCorrect = inputValue.trim().toLowerCase() === currentWordInfo.originalWord.term.toLowerCase();

        const updatedGameWordsInfo = [...gameWordsInfo];
        const updatedWordInfo = { ...updatedGameWordsInfo[currentWordIndex] };
        updatedWordInfo.submissions += 1;

        if (isCorrect) {
            updatedWordInfo.isCorrectlyTyped = true;
            if (updatedWordInfo.submissions === 1) {
                updatedWordInfo.firstTryCorrect = true;
            }
            updatedGameWordsInfo[currentWordIndex] = updatedWordInfo;
            setGameWordsInfo(updatedGameWordsInfo);

            const points = updatedWordInfo.firstTryCorrect ? 15 : 5;
            setCurrentScore(prev => prev + points);
            setInputFeedbackStyle('border-green-500 ring-2 ring-green-500');
            setInputValue('');
            
            setTimeout(() => {
                if (currentWordIndex + 1 < gameWordsInfo.length) {
                    setCurrentWordIndex(prev => prev + 1);
                } else {
                    finishGame();
                }
            }, 300);
        } else {
            updatedGameWordsInfo[currentWordIndex] = updatedWordInfo;
            setGameWordsInfo(updatedGameWordsInfo);
            setInputFeedbackStyle('border-red-500 ring-2 ring-red-500 animate-shake');
            setCurrentScore(prev => Math.max(0, prev - 3));
            addToast("오타! 다시 시도하세요.", "error");
        }
    };
    
    if (gameState === 'setup') {
        return (
            <div className="p-4 sm:p-8 flex flex-col items-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">⌨️ 타자 연습 게임 설정</h1>
                <div className="w-full max-w-md bg-slate-100 dark:bg-slate-700 p-6 rounded-lg shadow-lg space-y-6">
                    <div>
                        <label htmlFor="unit-select-typing" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">모드 선택</label>
                        <select
                            id="unit-select-typing"
                            value={String(selectedUnit)}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                            className="w-full p-3 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500"
                        >
                            <option value="all">전체 단어 ({MAX_WORDS_IN_GAME}개 랜덤)</option>
                            <optgroup label="단원별 게임">
                                {units.map(unit => <option key={unit} value={unit}>단원 {unit}</option>)}
                            </optgroup>
                        </select>
                         <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">알파벳으로만 구성된 단어만 출제됩니다.</p>
                    </div>
                    <button onClick={handleStartGame} className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md">
                        게임 시작
                    </button>
                </div>
            </div>
        );
    }
    
    const currentWordToType = gameWordsInfo[currentWordIndex]?.originalWord;
    
    if (!currentWordToType) {
        return <div className="p-8 text-center text-slate-600 dark:text-slate-300">게임 종료 중...</div>;
    }

    return (
        <div className="p-4 sm:p-6 flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-2">⌨️ 타자 연습 게임</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">단어 {currentWordIndex + 1}/{gameWordsInfo.length} | 점수: {currentScore}</p>

            <div className="w-full max-w-md bg-slate-100 dark:bg-slate-700 p-6 rounded-xl shadow-lg">
                <div className="text-center mb-4">
                    <p className="text-lg text-slate-600 dark:text-slate-300">아래 단어를 입력하세요:</p>
                    <p className="text-4xl font-bold text-slate-800 dark:text-white my-2">{currentWordToType.term}</p>
                    <p className="text-md text-slate-500 dark:text-slate-400">{currentWordToType.meaning}</p>
                </div>
                <form onSubmit={handleFormSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        className={`w-full p-4 text-center text-xl bg-white dark:bg-slate-600 text-slate-900 dark:text-white rounded-md border-2 shadow-inner transition-all ${inputFeedbackStyle}`}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                    />
                    <button type="submit" className="w-full mt-4 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md">
                        확인
                    </button>
                </form>
            </div>
             <button onClick={() => onNavigate('gameSelection')} className="mt-8 text-sm text-cyan-600 dark:text-cyan-400 hover:underline">다른 게임 선택</button>
        </div>
    );
};

// SpeedQuizGame
const SpeedQuizGame: React.FC = () => {
    const { allWords, onNavigate, handleGameComplete } = useAppContext();
    const { addToast } = useToasts();
    
    const [gameState, setGameState] = useState<'setup' | 'playing' | 'finished'>('setup');
    const [selectedUnit, setSelectedUnit] = useState<string|number>('all');
    const [timeLeft, setTimeLeft] = useState(60);
    const [shuffledWords, setShuffledWords] = useState<Word[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [options, setOptions] = useState<string[]>([]);
    const [correctCount, setCorrectCount] = useState(0);
    const [incorrectCount, setIncorrectCount] = useState(0);
    const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);

    const timerRef = useRef<number | null>(null);

    const units = useMemo(() => {
        const unitSet = new Set<string | number>();
        allWords.forEach(word => {
            if (word.unit) unitSet.add(word.unit);
        });
        return Array.from(unitSet).sort((a, b) => Number(a) - Number(b));
    }, [allWords]);

    const [optionSource, setOptionSource] = useState<Word[]>([]);

    const generateOptions = useCallback((correctWord: Word, optionSourceWords: Word[]) => {
        let incorrectMeaningPool = shuffleArray(
            optionSourceWords
                .filter(w => w.id !== correctWord.id)
                .map(w => w.meaning.split('/')[0].trim())
        );
        const uniqueIncorrectOptions = Array.from(new Set(incorrectMeaningPool)).slice(0, 3);
        
        let placeholderIndex = 1;
        while (uniqueIncorrectOptions.length < 3) {
            const placeholder = `오답 ${placeholderIndex++}`;
             if(!uniqueIncorrectOptions.includes(placeholder) && placeholder !== correctWord.meaning.split('/')[0].trim()) {
                 uniqueIncorrectOptions.push(placeholder);
            }
        }
        
        setOptions(shuffleArray([correctWord.meaning.split('/')[0].trim(), ...uniqueIncorrectOptions]));
    }, []);
    
    const setupNextQuestion = useCallback((index: number) => {
        if (shuffledWords.length === 0 || optionSource.length === 0) return;
        let nextWordIndex = index;
        let currentShuffled = shuffledWords;

        if (index >= shuffledWords.length) {
            currentShuffled = shuffleArray(shuffledWords);
            setShuffledWords(currentShuffled);
            nextWordIndex = 0;
            setCurrentQuestionIndex(0);
        }
        generateOptions(currentShuffled[nextWordIndex], optionSource);
    }, [shuffledWords, generateOptions, optionSource]);

    const endGame = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        
        const score = correctCount * 10 - incorrectCount * 5;
        const finalScore = Math.max(0, score);

        handleGameComplete(finalScore, correctCount, incorrectCount, 60);

        setGameState('finished');
        onNavigate('gameResult', {
            score: finalScore,
            correct: correctCount,
            incorrect: incorrectCount,
            timeTaken: 60, // Game is 60s long
            gameName: '스피드 퀴즈',
        });
    }, [correctCount, incorrectCount, onNavigate, handleGameComplete]);
    
    useEffect(() => {
        if (gameState === 'playing' && timeLeft > 0) {
            timerRef.current = window.setInterval(() => {
                setTimeLeft(prev => prev - 1);
            }, 1000);
        } else if (gameState === 'playing' && timeLeft <= 0) {
            endGame();
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [gameState, timeLeft, endGame]);

    const startGame = () => {
        let sourceWords: Word[] = [];
        if (selectedUnit === 'all') {
            sourceWords = allWords;
        } else {
            sourceWords = allWords.filter(w => String(w.unit) === String(selectedUnit));
        }

        if (sourceWords.length < 4) {
            addToast(`스피드 퀴즈를 위해 단어가 최소 4개 필요합니다.`, "warning");
            return;
        }
        
        const gameWords = shuffleArray(sourceWords);
        setShuffledWords(gameWords);
        setOptionSource(sourceWords);
        setTimeLeft(60);
        setCorrectCount(0);
        setIncorrectCount(0);
        setCurrentQuestionIndex(0);
        generateOptions(gameWords[0], sourceWords);
        setGameState('playing');
    };

    const handleAnswer = (selectedMeaning: string) => {
        if (gameState !== 'playing' || feedback !== null) return;
        
        const currentWord = shuffledWords[currentQuestionIndex];
        const correctAnswers = currentWord.meaning.split('/').map(m => m.trim());
        const isCorrect = correctAnswers.includes(selectedMeaning);
        
        setFeedback(isCorrect ? 'correct' : 'incorrect');

        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
            setTimeLeft(prev => Math.min(60, prev + 2)); 
        } else {
            setIncorrectCount(prev => prev + 1);
            setTimeLeft(prev => Math.max(0, prev - 3));
        }

        setTimeout(() => {
            setFeedback(null);
            const nextIndex = currentQuestionIndex + 1;
            setCurrentQuestionIndex(nextIndex);
            setupNextQuestion(nextIndex);
        }, 300);
    };
    
    if (gameState === 'setup') {
        return (
            <div className="p-4 sm:p-8 flex flex-col items-center justify-center min-h-[calc(100vh-150px)] sm:min-h-0">
                <h1 className="text-3xl sm:text-4xl font-bold text-cyan-600 dark:text-cyan-400 mb-4">⏱️ 스피드 퀴즈 설정</h1>
                 <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-md text-center">60초 동안 최대한 많은 단어의 뜻을 맞춰보세요! 정답 시 +2초, 오답 시 -3초.</p>
                <div className="w-full max-w-md bg-slate-100 dark:bg-slate-700 p-6 rounded-lg shadow-lg space-y-6">
                    <div>
                        <label htmlFor="unit-select-speed" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">모드 선택</label>
                        <select
                            id="unit-select-speed"
                            value={String(selectedUnit)}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                            className="w-full p-3 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500"
                        >
                            <option value="all">전체 단어</option>
                            <optgroup label="단원별 게임">
                                {units.map(unit => <option key={unit} value={unit}>단원 {unit}</option>)}
                            </optgroup>
                        </select>
                    </div>
                    <button onClick={startGame} className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md">
                        게임 시작!
                    </button>
                </div>
            </div>
        );
    }
    
    const currentWord = shuffledWords[currentQuestionIndex];
    if (gameState !== 'playing' || !currentWord) {
         return <div className="p-8 text-center text-slate-600 dark:text-slate-300">게임 로딩 중...</div>;
    }

    return (
        <div className={`p-4 sm:p-6 flex flex-col items-center transition-colors duration-300 min-h-[calc(100vh-100px)] justify-center ${feedback === 'correct' ? 'bg-green-100 dark:bg-green-800/30' : feedback === 'incorrect' ? 'bg-red-100 dark:bg-red-800/30' : ''}`}>
            <div className="w-full max-w-2xl">
                <div className="flex justify-between items-center mb-4">
                    <div className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                        <span className="text-green-500">정답: {correctCount}</span> | <span className="text-red-500">오답: {incorrectCount}</span>
                    </div>
                    <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                        남은 시간: {timeLeft}초
                    </div>
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2.5 mb-6">
                    <div className="bg-cyan-500 h-2.5 rounded-full" style={{ width: `${(timeLeft / 60) * 100}%` }}></div>
                </div>

                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-xl shadow-2xl p-6 sm:p-8">
                    <div className="text-center mb-6">
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">다음 단어의 뜻은 무엇일까요?</p>
                        <h2 className="text-4xl sm:text-5xl font-bold text-slate-800 dark:text-white">{currentWord.term}</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        {options.map((option, index) => (
                            <button
                                key={index}
                                onClick={() => handleAnswer(option)}
                                disabled={feedback !== null}
                                className="w-full p-3 sm:p-4 text-left rounded-lg shadow-md transition-colors bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-white hover:bg-cyan-500 dark:hover:bg-cyan-400 hover:text-white disabled:opacity-70"
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};


// WordShooterGame
interface FallingWord {
    word: Word;
    id: string; // unique key
    x: number; // %
    delay: number; // animation-delay in seconds
    duration: number; // animation-duration in seconds
}

const WordShooterGame: React.FC = () => {
    const { allWords, onNavigate, handleGameComplete } = useAppContext();
    const { addToast } = useToasts();
    
    const [gameState, setGameState] = useState<'setup' | 'playing' | 'finished'>('setup');
    const [selectedUnit, setSelectedUnit] = useState<string|number>('all');
    
    const [questions, setQuestions] = useState<Word[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(3);
    
    const [fallingWords, setFallingWords] = useState<FallingWord[]>([]);
    const [feedback, setFeedback] = useState<'correct' | 'incorrect' | 'miss' | null>(null);

    const NUM_QUESTIONS = 15;
    const MIN_WORDS_FOR_GAME = 5;

    const units = useMemo(() => {
        const unitSet = new Set<string | number>();
        allWords.forEach(word => {
            if (word.unit) unitSet.add(word.unit);
        });
        return Array.from(unitSet).sort((a, b) => Number(a) - Number(b));
    }, [allWords]);

    const currentQuestionWord = useMemo(() => questions[currentQuestionIndex], [questions, currentQuestionIndex]);

    const endGame = useCallback(() => {
        const correctAnswers = score / 10;
        const incorrectAnswers = Math.max(0, currentQuestionIndex - correctAnswers);
        handleGameComplete(score, correctAnswers, incorrectAnswers, 0);
        onNavigate('gameResult', { score, correct: correctAnswers, incorrect: incorrectAnswers, timeTaken: 0, gameName: '뜻 사격 게임' });
        setGameState('finished');
    }, [score, currentQuestionIndex, handleGameComplete, onNavigate]);

    useEffect(() => {
        if (lives <= 0 && gameState === 'playing') {
            addToast("게임 오버!", "error");
            endGame();
        }
    }, [lives, gameState, endGame, addToast]);

    const setupQuestion = useCallback((qIndex: number, gameWords: Word[], optionSource: Word[]) => {
        if (qIndex >= gameWords.length) {
            addToast("모든 문제를 완료했습니다!", "success");
            endGame();
            return;
        }

        const correctWord = gameWords[qIndex];
        const incorrectOptions = shuffleArray(optionSource.filter(w => w.id !== correctWord.id)).slice(0, MIN_WORDS_FOR_GAME - 1);
        const optionsForScreen = shuffleArray([correctWord, ...incorrectOptions]);

        setFallingWords(optionsForScreen.map((word, index) => ({
            word,
            id: `${word.id}-${qIndex}-${index}`,
            x: 5 + Math.random() * 80,
            delay: Math.random() * 1.5,
            duration: 8 + Math.random() * 4,
        })));
    }, [endGame]);

    const handleStartGame = () => {
        const sourceWords = selectedUnit === 'all' 
            ? allWords 
            : allWords.filter(w => String(w.unit) === String(selectedUnit));

        if (sourceWords.length < MIN_WORDS_FOR_GAME) {
            addToast(`사격 게임을 위해 단어가 최소 ${MIN_WORDS_FOR_GAME}개 필요합니다.`, "warning");
            return;
        }

        const gameQuestions = shuffleArray(sourceWords).slice(0, NUM_QUESTIONS);
        setQuestions(gameQuestions);
        setScore(0);
        setLives(3);
        setCurrentQuestionIndex(0);
        setFeedback(null);
        setupQuestion(0, gameQuestions, sourceWords);
        setGameState('playing');
    };
    
    const goToNextQuestion = useCallback(() => {
        const nextQIndex = currentQuestionIndex + 1;
        const sourceWords = selectedUnit === 'all' ? allWords : allWords.filter(w => String(w.unit) === String(selectedUnit));
        
        setTimeout(() => {
            setFeedback(null);
            setCurrentQuestionIndex(nextQIndex);
            setupQuestion(nextQIndex, questions, sourceWords);
        }, 800);
    }, [currentQuestionIndex, questions, selectedUnit, allWords, setupQuestion]);


    const handleWordSelection = (selectedWord: Word) => {
        if (feedback) return;

        const isCorrect = selectedWord.id === currentQuestionWord.id;
        if (isCorrect) {
            setScore(s => s + 10);
            setFeedback('correct');
        } else {
            setLives(l => l - 1);
            setFeedback('incorrect');
        }
        goToNextQuestion();
    };

    const handleAnimationEnd = (wordId: string | number) => {
        if (wordId === currentQuestionWord?.id && !feedback) {
            setLives(l => l - 1);
            setFeedback('miss');
            goToNextQuestion();
        }
    };
    
    if (gameState === 'setup') {
        return (
            <div className="p-4 sm:p-8 flex flex-col items-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">🎯 뜻 사격 게임 설정</h1>
                <div className="w-full max-w-md bg-slate-100 dark:bg-slate-700 p-6 rounded-lg shadow-lg space-y-6">
                    <div>
                        <label htmlFor="unit-select-shooter" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">모드 선택</label>
                        <select
                            id="unit-select-shooter"
                            value={String(selectedUnit)}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                            className="w-full p-3 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500"
                        >
                            <option value="all">전체 단어</option>
                            <optgroup label="단원별 게임">
                                {units.map(unit => <option key={unit} value={unit}>단원 {unit}</option>)}
                            </optgroup>
                        </select>
                    </div>
                    <button onClick={handleStartGame} className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md">
                        게임 시작
                    </button>
                </div>
            </div>
        );
    }

    if (!currentQuestionWord) {
        return <div className="p-8 text-center text-slate-600 dark:text-slate-300">게임 로딩 중...</div>;
    }
    
    const feedbackInfo = {
        correct: { text: "정답!", color: "text-green-500" },
        incorrect: { text: "오답!", color: "text-red-500" },
        miss: { text: "놓침!", color: "text-yellow-500" },
    };

    return (
        <div className="p-2 sm:p-4 flex flex-col items-center h-[calc(100vh-100px)] overflow-hidden">
            <div className="w-full max-w-3xl flex justify-between items-center mb-4 p-2 bg-slate-200/80 dark:bg-slate-700/80 rounded-lg">
                 <div className="text-sm sm:text-lg font-semibold text-slate-700 dark:text-slate-200">점수: {score}</div>
                 <div className="text-sm sm:text-base text-center">문제 {currentQuestionIndex + 1} / {questions.length}</div>
                 <div className="text-sm sm:text-lg font-semibold text-red-500">목숨: {'❤️'.repeat(lives)}</div>
            </div>
            
            <div className="w-full max-w-3xl text-center mb-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg shadow">
                 <p className="text-sm text-slate-500 dark:text-slate-400">다음 뜻을 가진 단어를 쏘세요:</p>
                <h2 className="text-lg sm:text-2xl font-bold text-cyan-600 dark:text-cyan-400">{currentQuestionWord.meaning}</h2>
            </div>
            
            <div className="relative w-full flex-grow bg-slate-50 dark:bg-slate-900 rounded-lg shadow-inner overflow-hidden">
                {feedback && (
                    <div className={`absolute inset-0 flex items-center justify-center text-5xl font-bold z-20 animate-ping ${feedbackInfo[feedback].color}`}>
                        {feedbackInfo[feedback].text}
                    </div>
                )}
                {fallingWords.map(fw => (
                    <button
                        key={fw.id}
                        onAnimationEnd={() => handleAnimationEnd(fw.word.id)}
                        onClick={() => handleWordSelection(fw.word)}
                        disabled={!!feedback}
                        className="absolute p-2 text-sm sm:text-base bg-slate-700 text-white rounded-lg shadow-lg cursor-pointer word-shooter-falling-word"
                        style={{
                            left: `${fw.x}%`,
                            animationDuration: `${fw.duration}s`,
                            animationDelay: `${fw.delay}s`,
                        }}
                    >
                        {fw.word.term}
                    </button>
                ))}
            </div>
            <button onClick={() => onNavigate('gameSelection')} className="mt-4 text-sm text-cyan-600 dark:text-cyan-400 hover:underline">다른 게임 선택</button>
        </div>
    );
};

// WordBombGame
const WordBombGame: React.FC = () => {
    const { allWords, onNavigate, handleGameComplete } = useAppContext();
    const { addToast } = useToasts();
    
    const [gameState, setGameState] = useState<'setup' | 'playing' | 'finished'>('setup');
    const [selectedUnit, setSelectedUnit] = useState<string|number>('all');
    
    const [bombs, setBombs] = useState<FallingWord[]>([]);
    const [lives, setLives] = useState(3);
    const [score, setScore] = useState(0);
    const [inputValue, setInputValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const bombSpawnInterval = useRef<number|null>(null);
    const gameWordsRef = useRef<Word[]>([]);
    const [isPaused, setIsPaused] = useState(false);

    const MIN_WORDS_FOR_GAME = 10;
    const BOMB_SPAWN_INTERVAL = 3000; // ms
    const BOMB_BASE_DURATION = 15; // seconds

    const units = useMemo(() => {
        const unitSet = new Set<string | number>();
        allWords.forEach(word => {
            if (word.unit) unitSet.add(word.unit);
        });
        return Array.from(unitSet).sort((a, b) => Number(a) - Number(b));
    }, [allWords]);

    const endGame = useCallback(() => {
        if (bombSpawnInterval.current) clearInterval(bombSpawnInterval.current);
        const correctAnswers = score / 10;
        const incorrectAnswers = 3 - lives;
        handleGameComplete(score, correctAnswers, incorrectAnswers, 0);
        onNavigate('gameResult', { score, correct: correctAnswers, incorrect: incorrectAnswers, gameName: '단어 폭탄 제거' });
        setGameState('finished');
    }, [score, lives, handleGameComplete, onNavigate]);

    const spawnBomb = useCallback(() => {
        if (gameWordsRef.current.length === 0) return;
        const word = shuffleArray(gameWordsRef.current)[0];
        const newBomb = {
            word,
            id: `${word.id}-${Date.now()}`,
            x: 10 + Math.random() * 80,
            delay: 0,
            duration: BOMB_BASE_DURATION - Math.log(score + 1) * 2, // Gets faster as score increases
        };
        setBombs(prev => [...prev, newBomb]);
    }, [score]);

    const handleStartGame = () => {
        const alphabetOnly = (term: string) => /^[a-zA-Z\s'-]+$/.test(term);
        const sourceWords = (selectedUnit === 'all' 
            ? allWords 
            : allWords.filter(w => String(w.unit) === String(selectedUnit))
        ).filter(w => alphabetOnly(w.term));
        
        if (sourceWords.length < MIN_WORDS_FOR_GAME) {
            addToast(`폭탄 제거 게임을 위해 알파벳 단어가 최소 ${MIN_WORDS_FOR_GAME}개 필요합니다.`, "warning");
            return;
        }
        
        gameWordsRef.current = sourceWords;
        setScore(0);
        setLives(3);
        setBombs([]);
        setInputValue("");
        setIsPaused(false);
        setGameState('playing');
        
        bombSpawnInterval.current = window.setInterval(spawnBomb, BOMB_SPAWN_INTERVAL);
        inputRef.current?.focus();
    };
    
    useEffect(() => {
        if (gameState === 'playing' && lives <= 0) {
            endGame();
        }
    }, [gameState, lives, endGame]);

    useEffect(() => { // Cleanup interval on unmount
        return () => {
            if (bombSpawnInterval.current) clearInterval(bombSpawnInterval.current);
        }
    }, []);

    const handleBombExplosion = (bombId: string) => {
        setBombs(prev => prev.filter(b => b.id !== bombId));
        setLives(prev => prev - 1);
        addToast("펑! 폭탄을 놓쳤습니다.", "error");
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedInput = inputValue.trim().toLowerCase();
        if (!trimmedInput) return;
        
        const targetBomb = bombs.find(b => b.word.term.toLowerCase() === trimmedInput);
        if (targetBomb) {
            setBombs(prev => prev.filter(b => b.id !== targetBomb.id));
            setScore(s => s + 10);
            addToast("폭탄 제거 성공! +10점", "success");
        } else {
            addToast("오타! 해당 단어의 폭탄이 없습니다.", "warning");
             if (inputRef.current) {
                inputRef.current.classList.add('animate-shake');
                setTimeout(() => inputRef.current?.classList.remove('animate-shake'), 500);
            }
        }
        setInputValue("");
    };
    
    if (gameState === 'setup') {
         return (
            <div className="p-4 sm:p-8 flex flex-col items-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">💣 단어 폭탄 제거 설정</h1>
                <div className="w-full max-w-md bg-slate-100 dark:bg-slate-700 p-6 rounded-lg shadow-lg space-y-6">
                    <div>
                        <label htmlFor="unit-select-bomb" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">모드 선택</label>
                        <select
                            id="unit-select-bomb"
                            value={String(selectedUnit)}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                            className="w-full p-3 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500"
                        >
                            <option value="all">전체 단어</option>
                            <optgroup label="단원별 게임">
                                {units.map(unit => <option key={unit} value={unit}>단원 {unit}</option>)}
                            </optgroup>
                        </select>
                         <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">알파벳으로만 구성된 단어만 출제됩니다.</p>
                    </div>
                    <button onClick={handleStartGame} className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md">
                        게임 시작
                    </button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="p-2 sm:p-4 flex flex-col h-[calc(100vh-100px)] overflow-hidden">
            <div className="w-full max-w-4xl mx-auto flex justify-between items-center mb-4 p-2 bg-slate-200/80 dark:bg-slate-700/80 rounded-lg">
                <div className="text-sm sm:text-lg font-semibold text-slate-700 dark:text-slate-200">점수: {score}</div>
                <div className="text-sm sm:text-lg font-semibold text-red-500">목숨: {'❤️'.repeat(lives)}</div>
                 <button onClick={() => setIsPaused(!isPaused)} className="text-sm px-3 py-1 bg-yellow-500 text-white rounded">{isPaused ? '계속하기' : '일시정지'}</button>
            </div>
            
            <div className={`relative w-full flex-grow bg-slate-50 dark:bg-slate-900 rounded-lg shadow-inner overflow-hidden`}>
                {bombs.map(bomb => (
                    <div
                        key={bomb.id}
                        onAnimationEnd={() => handleBombExplosion(bomb.id)}
                        className="absolute text-center word-bomb"
                        style={{
                            left: `${bomb.x}%`,
                            animationDuration: `${bomb.duration}s`,
                            animationPlayState: isPaused ? 'paused' : 'running',
                        }}
                    >
                         <div className="p-1 sm:p-2 bg-slate-800 text-white text-xs sm:text-sm rounded-t-md">{bomb.word.meaning}</div>
                        <div className="text-3xl sm:text-4xl">💣</div>
                    </div>
                ))}
            </div>

            <form onSubmit={handleFormSubmit} className="w-full max-w-4xl mx-auto mt-4">
                 <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="단어를 입력하여 폭탄을 제거하세요!"
                    className="w-full p-3 text-center bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg border-2 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    disabled={isPaused}
                    autoFocus
                />
            </form>
        </div>
    );
}

// WordZombieDefense
const WordZombieDefense: React.FC = () => {
    const { allWords, onNavigate, handleGameComplete } = useAppContext();
    const { addToast } = useToasts();

    type GameState = 'setup' | 'playing' | 'finished';
    type Zombie = {
        id: string;
        word: Word;
        y: number; // position from top in %
        duration: number; // animation duration in s
    };

    const [gameState, setGameState] = useState<GameState>('setup');
    const [selectedUnit, setSelectedUnit] = useState<string | number>('all');
    
    const [zombies, setZombies] = useState<Zombie[]>([]);
    const [lives, setLives] = useState(5);
    const [score, setScore] = useState(0);
    const [inputValue, setInputValue] = useState("");
    
    const inputRef = useRef<HTMLInputElement>(null);
    const spawnIntervalRef = useRef<number | null>(null);
    const gameWordsRef = useRef<Word[]>([]);

    const MIN_WORDS_FOR_GAME = 10;
    const ZOMBIE_SPAWN_INTERVAL = 3500; // ms
    const ZOMBIE_BASE_DURATION = 20; // seconds

    const units = useMemo(() => {
        const unitSet = new Set<string | number>();
        allWords.forEach(word => {
            if (word.unit) unitSet.add(word.unit);
        });
        return Array.from(unitSet).sort((a, b) => Number(a) - Number(b));
    }, [allWords]);

    const endGame = useCallback(() => {
        if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
        const correctCount = score / 10;
        const incorrectCount = 5 - lives; // Initial lives is 5
        handleGameComplete(score, correctCount, incorrectCount, 0);
        onNavigate('gameResult', { score, correct: correctCount, incorrect: incorrectCount, gameName: '단어 좀비 디펜스' });
        setGameState('finished');
    }, [score, lives, handleGameComplete, onNavigate]);

    const handleZombieReachedBase = useCallback((zombieId: string) => {
        // This function is called when a zombie's animation ends.
        setZombies(prev => {
            if (prev.some(z => z.id === zombieId)) {
                setLives(l => l - 1);
                addToast("좀비가 기지를 공격했습니다!", "warning");
                return prev.filter(z => z.id !== zombieId);
            }
            return prev;
        });
    }, [addToast]);
    
    const spawnZombie = useCallback(() => {
        if (gameWordsRef.current.length === 0) return;
        const word = shuffleArray(gameWordsRef.current)[0];
        // Speed increases as score increases, with a minimum speed
        const speed = Math.max(8, ZOMBIE_BASE_DURATION - (score / 40));
        
        const newZombie: Zombie = {
            id: `${word.id}-${Date.now()}`,
            word: word,
            y: Math.random() * 85, // 0% to 85% from top to avoid overlapping the input
            duration: speed,
        };
        setZombies(prev => [...prev, newZombie]);
    }, [score]);

    const handleStartGame = () => {
        const alphabetOnly = (term: string) => /^[a-zA-Z\s'-]+$/.test(term);
        const sourceWords = (selectedUnit === 'all' 
            ? allWords 
            : allWords.filter(w => String(w.unit) === String(selectedUnit))
        ).filter(w => alphabetOnly(w.term));
        
        if (sourceWords.length < MIN_WORDS_FOR_GAME) {
            addToast(`좀비 디펜스 게임을 위해 알파벳 단어가 최소 ${MIN_WORDS_FOR_GAME}개 필요합니다.`, "warning");
            return;
        }
        
        gameWordsRef.current = sourceWords;
        setScore(0);
        setLives(5);
        setZombies([]);
        setInputValue("");
        setGameState('playing');
        
        spawnZombie(); // Spawn first zombie immediately
        spawnIntervalRef.current = window.setInterval(spawnZombie, ZOMBIE_SPAWN_INTERVAL);
        inputRef.current?.focus();
    };

    useEffect(() => {
        if (gameState === 'playing' && lives <= 0) {
            endGame();
        }
    }, [gameState, lives, endGame]);

    useEffect(() => { // Cleanup interval on component unmount
        return () => {
            if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
        }
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedInput = inputValue.trim().toLowerCase();
        if (!trimmedInput) return;
        
        const targetZombie = zombies.find(z => z.word.term.toLowerCase() === trimmedInput);
        
        if (targetZombie) {
            setZombies(prev => prev.filter(z => z.id !== targetZombie.id));
            setScore(s => s + 10);
            addToast("좀비 퇴치! +10점", "success");
        } else {
            addToast("오타! 단어를 다시 확인하세요.", "error");
            if (inputRef.current) {
                inputRef.current.classList.add('animate-shake');
                setTimeout(() => inputRef.current?.classList.remove('animate-shake'), 500);
            }
        }
        setInputValue("");
    };

    if (gameState === 'setup') {
        return (
            <div className="p-4 sm:p-8 flex flex-col items-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">🧟 단어 좀비 디펜스 설정</h1>
                <div className="w-full max-w-md bg-slate-100 dark:bg-slate-700 p-6 rounded-lg shadow-lg space-y-6">
                    <div>
                        <label htmlFor="unit-select-zombie" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">모드 선택</label>
                        <select
                            id="unit-select-zombie"
                            value={String(selectedUnit)}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                            className="w-full p-3 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500"
                        >
                            <option value="all">전체 단어</option>
                            <optgroup label="단원별 게임">
                                {units.map(unit => <option key={unit} value={unit}>단원 {unit}</option>)}
                            </optgroup>
                        </select>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">알파벳으로만 구성된 단어만 출제됩니다.</p>
                    </div>
                    <button onClick={handleStartGame} className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md">
                        기지 방어 시작
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-2 sm:p-4 flex flex-col h-[calc(100vh-100px)] overflow-hidden">
            <div className="w-full max-w-4xl mx-auto flex justify-between items-center mb-4 p-2 bg-slate-200/80 dark:bg-slate-700/80 rounded-lg">
                <div className="text-sm sm:text-lg font-semibold text-slate-700 dark:text-slate-200">점수: {score}</div>
                <div className="text-sm sm:text-lg font-semibold text-red-500">기지 내구도: {'🛡️'.repeat(lives)}</div>
                <button onClick={() => onNavigate('gameSelection')} className="text-xs px-2 py-1 bg-slate-500 text-white rounded">게임 포기</button>
            </div>
            
            <div className="relative w-full flex-grow bg-slate-50 dark:bg-gray-800 rounded-lg shadow-inner overflow-hidden">
                {/* Base on the left */}
                <div className="absolute left-0 top-0 h-full w-16 bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-4xl">🏰</div>
                
                {zombies.map(zombie => (
                    <div
                        key={zombie.id}
                        onAnimationEnd={() => handleZombieReachedBase(zombie.id)}
                        className="absolute text-center zombie-walker"
                        style={{
                            top: `${zombie.y}%`,
                            animationDuration: `${zombie.duration}s`,
                        }}
                    >
                        <div className="p-1 text-xs sm:text-sm bg-black/70 text-white rounded-md mb-1 whitespace-nowrap">{zombie.word.meaning}</div>
                        <div className="text-3xl sm:text-4xl">🧟</div>
                    </div>
                ))}
            </div>

            <form onSubmit={handleSubmit} className="w-full max-w-4xl mx-auto mt-4">
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="단어를 입력해 좀비를 막으세요!"
                    className="w-full p-3 text-center bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg border-2 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck="false"
                />
            </form>
        </div>
    );
};


// WordPuzzleSlideGame
type PuzzlePiece = {
    id: string;
    content: string;
    type: 'word' | 'meaning' | 'example';
    correctPosition: number;
    currentPosition: number;
    isCorrect: boolean;
};

const WordPuzzleSlideGame: React.FC = () => {
    const { allWords, onNavigate, handleGameComplete } = useAppContext();
    const { addToast } = useToasts();
    
    const [gameState, setGameState] = useState<'setup' | 'playing' | 'finished'>('setup');
    const [selectedUnit, setSelectedUnit] = useState<string|number>('all');
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [gameWords, setGameWords] = useState<Word[]>([]);
    const [puzzlePieces, setPuzzlePieces] = useState<PuzzlePiece[]>([]);
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(3);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [selectedPiece, setSelectedPiece] = useState<PuzzlePiece | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);
    
    const MIN_WORDS_FOR_GAME = 5;
    const POINTS_PER_CORRECT = 20;
    const POINTS_BONUS_PERFECT = 50;

    const units = useMemo(() => {
        const unitSet = new Set<string | number>();
        allWords.forEach(word => {
            if (word.unit) unitSet.add(word.unit);
        });
        return Array.from(unitSet).sort((a, b) => Number(a) - Number(b));
    }, [allWords]);

    const initializeGame = useCallback((wordsForGame: Word[]) => {
        const selectedWords = shuffleArray(wordsForGame).slice(0, 10);
        setGameWords(selectedWords);
        setCurrentWordIndex(0);
        setScore(0);
        setLives(3);
        setStartTime(Date.now());
        setGameState('playing');
        setupPuzzleForWord(selectedWords[0]);
    }, []);

    const setupPuzzleForWord = useCallback((word: Word) => {
        const pieces: PuzzlePiece[] = [
            {
                id: `word-${word.id}`,
                content: word.term,
                type: 'word',
                correctPosition: 0,
                currentPosition: 0,
                isCorrect: false
            },
            {
                id: `meaning-${word.id}`,
                content: word.meaning,
                type: 'meaning',
                correctPosition: 1,
                currentPosition: 1,
                isCorrect: false
            },
            {
                id: `example-${word.id}`,
                content: word.exampleSentence || `Example: ${word.term}를 사용한 예문`,
                type: 'example',
                correctPosition: 2,
                currentPosition: 2,
                isCorrect: false
            }
        ];
        
        // 퍼즐 조각들을 섞어서 배치
        const shuffledPositions = shuffleArray([0, 1, 2]);
        pieces.forEach((piece, index) => {
            piece.currentPosition = shuffledPositions[index];
        });
        
        setPuzzlePieces(pieces);
        setSelectedPiece(null);
        setIsAnimating(false);
    }, []);

    const handleStartGame = () => {
        const sourceWords = (selectedUnit === 'all' 
            ? allWords 
            : allWords.filter(w => String(w.unit) === String(selectedUnit))
        ).filter(w => w.meaning && w.meaning.trim().length > 0);
        
        if (sourceWords.length < MIN_WORDS_FOR_GAME) {
            addToast(`퍼즐 게임을 위해 뜻이 있는 단어가 최소 ${MIN_WORDS_FOR_GAME}개 필요합니다.`, "warning");
            return;
        }
        
        initializeGame(sourceWords);
    };

    const handlePieceClick = (piece: PuzzlePiece) => {
        if (isAnimating) return;
        
        if (!selectedPiece) {
            setSelectedPiece(piece);
        } else if (selectedPiece.id === piece.id) {
            setSelectedPiece(null);
        } else {
            // 두 조각의 위치를 교환
            swapPieces(selectedPiece, piece);
        }
    };

    const swapPieces = (piece1: PuzzlePiece, piece2: PuzzlePiece) => {
        setIsAnimating(true);
        
        setPuzzlePieces(prev => prev.map(p => {
            if (p.id === piece1.id) {
                return { ...p, currentPosition: piece2.currentPosition };
            } else if (p.id === piece2.id) {
                return { ...p, currentPosition: piece1.currentPosition };
            }
            return p;
        }));
        
        setTimeout(() => {
            setSelectedPiece(null);
            setIsAnimating(false);
            checkPuzzleComplete();
        }, 300);
    };

    const checkPuzzleComplete = () => {
        const allCorrect = puzzlePieces.every(piece => piece.currentPosition === piece.correctPosition);
        
        if (allCorrect) {
            // 정답 처리
            const bonusPoints = puzzlePieces.length === 3 ? POINTS_BONUS_PERFECT : 0;
            const totalPoints = POINTS_PER_CORRECT + bonusPoints;
            setScore(prev => prev + totalPoints);
            
            addToast(`정답! +${totalPoints}점`, "success");
            
            setTimeout(() => {
                moveToNextWord();
            }, 1000);
        }
    };

    const moveToNextWord = () => {
        if (currentWordIndex < gameWords.length - 1) {
            const nextIndex = currentWordIndex + 1;
            setCurrentWordIndex(nextIndex);
            setupPuzzleForWord(gameWords[nextIndex]);
        } else {
            // 게임 종료
            endGame();
        }
    };

    const handleSkip = () => {
        setLives(prev => {
            const newLives = prev - 1;
            if (newLives <= 0) {
                endGame();
                return 0;
            }
            return newLives;
        });
        
        addToast("문제를 건너뛰었습니다. 생명 -1", "warning");
        moveToNextWord();
    };

    const endGame = () => {
        const playTime = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
        const correctAnswers = currentWordIndex;
        const incorrectAnswers = gameWords.length - correctAnswers;
        
        handleGameComplete(score, correctAnswers, incorrectAnswers, playTime);
        onNavigate('gameResult', { 
            score, 
            correct: correctAnswers, 
            incorrect: incorrectAnswers,
            playTime,
            gameName: '뜻 맞추기 퍼즐'
        });
        setGameState('finished');
    };

    const getSortedPieces = () => {
        return [...puzzlePieces].sort((a, b) => a.currentPosition - b.currentPosition);
    };

    const getPieceStyle = (piece: PuzzlePiece) => {
        const isSelected = selectedPiece?.id === piece.id;
        const isCorrect = piece.currentPosition === piece.correctPosition;
        
        let bgColor = 'bg-slate-100 dark:bg-slate-700';
        let borderColor = 'border-slate-300 dark:border-slate-600';
        
        if (isSelected) {
            bgColor = 'bg-blue-100 dark:bg-blue-800';
            borderColor = 'border-blue-500 dark:border-blue-400';
        } else if (isCorrect) {
            bgColor = 'bg-green-100 dark:bg-green-800';
            borderColor = 'border-green-500 dark:border-green-400';
        }
        
        return `${bgColor} ${borderColor} border-2 rounded-lg p-4 cursor-pointer transition-all duration-300 hover:shadow-lg transform hover:scale-105`;
    };

    const getPieceIcon = (type: PuzzlePiece['type']) => {
        switch (type) {
            case 'word': return '📝';
            case 'meaning': return '💭';
            case 'example': return '📖';
            default: return '❓';
        }
    };

    if (gameState === 'setup') {
        return (
            <div className="p-4 sm:p-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6 text-center">
                    🧩 뜻 맞추기 퍼즐
                </h1>
                <div className="bg-slate-100 dark:bg-slate-700 rounded-xl p-6 mb-6">
                    <h2 className="text-xl font-semibold text-cyan-700 dark:text-cyan-300 mb-4">게임 설명</h2>
                    <ul className="text-slate-600 dark:text-slate-400 space-y-2">
                        <li>• 단어, 뜻, 예문을 올바른 순서로 배열하세요</li>
                        <li>• 조각을 클릭하여 선택하고, 다른 조각과 교환하세요</li>
                        <li>• 정답 시 보너스 점수를 획득합니다</li>
                        <li>• 생명은 3개이며, 건너뛸 때마다 1개씩 감소합니다</li>
                    </ul>
                </div>
                
                <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        학습 단원 선택
                    </label>
                    <select
                        value={selectedUnit}
                        onChange={(e) => setSelectedUnit(e.target.value)}
                        className="w-full max-w-xs p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                        <option value="all">전체 단원</option>
                        {units.map(unit => (
                            <option key={unit} value={unit}>단원 {unit}</option>
                        ))}
                    </select>
                </div>

                <div className="text-center">
                    <button
                        onClick={handleStartGame}
                        className="py-3 px-8 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md transition-colors duration-200"
                    >
                        게임 시작
                    </button>
                </div>
            </div>
        );
    }

    if (gameState === 'playing') {
        const currentWord = gameWords[currentWordIndex];
        const progress = ((currentWordIndex + 1) / gameWords.length) * 100;
        
        return (
            <div className="p-4 sm:p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">🧩 뜻 맞추기 퍼즐</h1>
                    <div className="flex items-center space-x-4">
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                            {currentWordIndex + 1} / {gameWords.length}
                        </div>
                        <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                            {score}점
                        </div>
                        <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                            ❤️ {lives}
                        </div>
                    </div>
                </div>

                <div className="bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-6">
                    <div 
                        className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <div className="text-center mb-8">
                    <p className="text-lg text-slate-600 dark:text-slate-400">
                        다음 단어를 올바른 순서로 배열하세요
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 max-w-2xl mx-auto">
                    {getSortedPieces().map((piece, index) => (
                        <div
                            key={piece.id}
                            onClick={() => handlePieceClick(piece)}
                            className={getPieceStyle(piece)}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <span className="text-2xl">{getPieceIcon(piece.type)}</span>
                                    <div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400 uppercase">
                                            {piece.type === 'word' ? '단어' : piece.type === 'meaning' ? '뜻' : '예문'}
                                        </div>
                                        <div className="text-lg font-medium text-slate-900 dark:text-slate-100">
                                            {piece.content}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-2xl text-slate-400">
                                    {piece.currentPosition === piece.correctPosition ? '✅' : '🔄'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-center space-x-4 mt-8">
                    <button
                        onClick={handleSkip}
                        className="py-2 px-6 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-md transition-colors duration-200"
                    >
                        건너뛰기 (-1 생명)
                    </button>
                    <button
                        onClick={() => onNavigate('gameSelection')}
                        className="py-2 px-6 bg-slate-500 hover:bg-slate-600 text-white font-semibold rounded-lg shadow-md transition-colors duration-200"
                    >
                        게임 종료
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 text-center text-slate-600 dark:text-slate-300">
            게임 종료 중...
        </div>
    );
};



// --- Main App Component ---
const App: React.FC = () => {
    const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
    const [allWords, setAllWords] = useState<Word[]>([]);
    const [wordStats, setWordStats] = useState<Record<string | number, WordStat>>({});
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [globalLoading, setGlobalLoading] = useState(false);
    const [appScreen, setAppScreen] = useState<AppScreen>('loginSetup');
    const [routeParams, setRouteParams] = useState<any>(null);

    const { addToast } = useToasts();

    // 즉시 다크모드 적용 (페이지 로드 시 깜빡임 방지)
    useEffect(() => {
        const savedSettings = localStorage.getItem('userSettings');
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                if (settings.theme === 'dark') {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            } catch (error) {
                console.error('Failed to parse user settings for theme:', error);
            }
        }
    }, []);

    // Load data from localStorage on initial render
    useEffect(() => {
        try {
            const savedSettings = localStorage.getItem('userSettings');
            const savedWords = localStorage.getItem('allWords');
            const savedStats = localStorage.getItem('wordStats');
            
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                setUserSettings(settings);
                setAppScreen('dashboard'); // If settings exist, go to dashboard
            } else {
                 setAppScreen('loginSetup'); // Otherwise, show setup
            }

            if (savedWords) {
                setAllWords(JSON.parse(savedWords));
            } else {
                setAllWords(sampleWords);
            }

            if (savedStats) {
                setWordStats(JSON.parse(savedStats));
            } else {
                // Initialize stats if none exist
                const initialStats: Record<string, WordStat> = {};
                sampleWords.forEach(word => {
                    initialStats[word.id] = getDefaultWordStat(word.id);
                });
                setWordStats(initialStats);
            }
        } catch (error) {
            console.error("Failed to load data from localStorage:", error);
            addToast("데이터를 불러오는 데 실패했습니다. 기본 설정으로 시작합니다.", "error");
            setAllWords(sampleWords); // Fallback to sample words
        }
        
    }, [addToast]);
    
     // --- Data Saving ---
    const saveData = useCallback((key: string, data: any) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error(`Failed to save ${key} to localStorage:`, error);
            addToast("데이터 저장에 실패했습니다. 진행 상황이 유실될 수 있습니다.", "error");
        }
    }, [addToast]);

    const handleSaveSettings = (settings: UserSettings) => {
        setUserSettings(settings);
        saveData('userSettings', settings);
        addToast("설정이 저장되었습니다.", "success");

        if (settings.theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };
    
    // --- Navigation ---
    const handleNavigate = (screen: AppScreen, params: any = null) => {
        setAppScreen(screen);
        setRouteParams(params);
        window.scrollTo(0, 0); // Scroll to top on navigation
    };
    
    // --- Core Logic Handlers ---
    const addXp = useCallback((amount: number) => {
        if (!userSettings) return;

        setUserSettings(prevSettings => {
            if (!prevSettings) return null;
            const newXp = prevSettings.xp + amount;
            const xpForNextLevel = prevSettings.level * 100;
            let newLevel = prevSettings.level;

            if (newXp >= xpForNextLevel) {
                newLevel += 1;
                addToast(`레벨 업! 🎉 레벨 ${newLevel}이 되었습니다!`, 'success');
            }
            
            const updatedSettings = { ...prevSettings, xp: newXp, level: newLevel };
            saveData('userSettings', updatedSettings); // Save immediately
            return updatedSettings;
        });
    }, [userSettings, addToast]);
    
    const handleWordLearned = useCallback((wordId: string | number) => {
        if (!userSettings) return;

        const today = getTodayDateString();
        // Check if the last learned date is not today, if so, reset the daily count and update streak
        if (userSettings.lastLearnedDate !== today) {
            addXp(5); // XP for starting a new day
        }

        updateWordStat(wordId, { lastReviewed: new Date().toISOString() });

        const updatedSettings = { ...userSettings, lastLearnedDate: today };
        handleSaveSettings(updatedSettings);
    }, [userSettings, addXp]);

    const handleQuizComplete = useCallback((score: number, total: number, incorrectWords: Word[]) => {
        if (!userSettings) return;
        const today = getTodayDateString();
        const updatedSettings = { ...userSettings, lastQuizDate: today, lastQuizScore: (score / total) * 100 };
        handleSaveSettings(updatedSettings);
        addXp(score * 2); // 2 XP per correct answer
        incorrectWords.forEach(word => {
            updateWordStat(word.id, { quizIncorrectCount: (wordStats[word.id]?.quizIncorrectCount || 0) + 1 });
        });
    }, [userSettings, addXp, wordStats]);

    const handleGameComplete = useCallback((score: number, correct: number, incorrect: number, timeTaken: number) => {
        if (!userSettings) return;
        const today = getTodayDateString();
        const updatedSettings = { ...userSettings, lastGameDate: today };
        handleSaveSettings(updatedSettings);
        addXp(score); // Add score as XP
    }, [userSettings, addXp]);
    
    // --- Word & Stat Management ---
     const updateWordStat = (wordId: string | number, updates: Partial<WordStat>) => {
        setWordStats(prevStats => {
            const newStats = { ...prevStats };
            const currentStat = newStats[wordId] || getDefaultWordStat(wordId);
            newStats[wordId] = { ...currentStat, ...updates };
            saveData('wordStats', newStats);
            return newStats;
        });
    };

    const handleDeleteCustomWord = (wordId: string | number, options = { silent: false }) => {
        setAllWords(prev => {
            const wordToDelete = prev.find(w => w.id === wordId);
            if (!wordToDelete || !wordToDelete.isCustom) {
                 if (!options.silent) addToast("기본 단어는 삭제할 수 없습니다.", "error");
                 return prev;
            }
            const newWords = prev.filter(w => w.id !== wordId);
            saveData('allWords', newWords);
            if (!options.silent) addToast(`'${wordToDelete.term}' 단어를 삭제했습니다.`, "success");
            return newWords;
        });
        setWordStats(prev => {
            const newStats = { ...prev };
            delete newStats[wordId];
            saveData('wordStats', newStats);
            return newStats;
        });
    };

    const handleSaveCustomWord = async (word: Partial<Word>, gradeLevel = userSettings?.grade, unit?: number): Promise<{ success: boolean; reason?: string }> => {
        if (!word.term?.trim() || !word.meaning?.trim()) {
            return { success: false, reason: '단어와 뜻은 필수입니다.' };
        }
        
        const isEditing = word.id !== undefined && word.id !== null;
        const normalizedTerm = word.term.trim().toLowerCase();
        
        // Check for duplicates
        const duplicateExists = allWords.some(w => w.term.toLowerCase() === normalizedTerm && w.id !== word.id);
        if (duplicateExists) {
            return { success: false, reason: '이미 존재하는 단어입니다.' };
        }
        
        let wordToSave: Word;
        if (isEditing) {
            wordToSave = { ...(word as Word), unit };
        } else {
             wordToSave = {
                id: `custom-${Date.now()}-${Math.random()}`,
                term: word.term.trim(),
                meaning: word.meaning.trim(),
                pronunciation: word.pronunciation || '',
                partOfSpeech: word.partOfSpeech || '명사',
                exampleSentence: word.exampleSentence || '',
                exampleSentenceMeaning: word.exampleSentenceMeaning || '',
                gradeLevel: gradeLevel || 'middle2',
                isCustom: true,
                unit: unit
            };
        }

        setAllWords(prev => {
            let newWords;
            if (isEditing) {
                newWords = prev.map(w => w.id === wordToSave.id ? wordToSave : w);
            } else {
                newWords = [...prev, wordToSave];
                // Also add a default stat for the new word
                updateWordStat(wordToSave.id, getDefaultWordStat(wordToSave.id));
            }
            saveData('allWords', newWords);
            return newWords;
        });
        return { success: true };
    };

    // --- Memoized Stats for Performance ---
    const memoizedStats = useMemo(() => {
        const today = getTodayDateString();
        const learnedWordsToday = Object.values(wordStats).filter(stat => stat.lastReviewed?.startsWith(today)).length;
        const totalWordsLearned = Object.values(wordStats).filter(stat => stat.lastReviewed !== null).length;
        
        const quizTakenToday = userSettings?.lastQuizDate === today;
        const gamePlayedToday = userSettings?.lastGameDate === today;

        let totalScore = 0;
        let quizCount = 0;
        Object.values(wordStats).forEach(stat => {
            // This is a simplified calculation, a more robust system would store all quiz results.
            // For now, let's fake it based on something. We'll use the last quiz score.
        });
         const averageQuizScore = userSettings?.lastQuizScore || 0; // simplified
        
        const hasIncorrectWordsToReview = Object.values(wordStats).some(stat => stat.quizIncorrectCount > 0);

        // Streak calculation
        const currentStreak = userSettings?.currentStreak || 0;
        const bestStreak = userSettings?.bestStreak || 0;

        return { learnedWordsToday, totalWordsLearned, learningStreak: { currentStreak, bestStreak }, averageQuizScore, quizTakenToday, gamePlayedToday, hasIncorrectWordsToReview };
    }, [wordStats, userSettings]);


    const handleResetData = () => {
        localStorage.clear();
        setUserSettings(null);
        setAllWords(sampleWords);
        setWordStats({});
        setAppScreen('loginSetup');
        addToast("모든 데이터가 초기화되었습니다.", "success");
         if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
        }
    };
    
    // --- Render Logic ---
    const renderScreen = () => {
        if (!userSettings) {
            return <LoginSetupScreen onSetupComplete={handleSaveSettings} />;
        }
        
        switch (appScreen) {
            case 'dashboard':
                return <DashboardScreen {...memoizedStats} />;
            case 'learnWords':
                return <LearnWordsScreen routeParams={routeParams} />;
            case 'quiz':
                 return <QuizScreen routeParams={routeParams} />;
            case 'allWords':
                return <AllWordsScreen />;
            case 'stats':
                return <StatsScreen />;
            case 'manageWords':
                return <ManageWordsScreen />;
            case 'tutorChat':
                return <TutorChatScreen />;
            case 'gameSelection':
                return <GameSelectionScreen />;
            case 'wordMatchGame':
                return <WordMatchGame />;
            case 'gameResult':
                return <GameResultScreen routeParams={routeParams} />;
            case 'typingPracticeGame':
                return <TypingPracticeGame />;
            case 'speedQuizGame':
                return <SpeedQuizGame />;
            case 'wordShooterGame':
                return <WordShooterGame />;
            case 'wordBombGame':
                return <WordBombGame />;
            case 'wordZombieDefense':
                return <WordZombieDefense />;
            case 'wordPuzzleSlideGame':
                return <WordPuzzleSlideGame />;
            default:
                return <DashboardScreen {...memoizedStats} />;
        }
    };

    const appContextValue: AppContextType | undefined = userSettings ? {
        userSettings,
        handleSaveSettings,
        handleResetData,
        onNavigate: handleNavigate,
        allWords,
        wordStats,
        handleWordLearned,
        handleQuizComplete,
        updateWordStat,
        handleDeleteCustomWord,
        handleSaveCustomWord,
        memoizedStats,
        setGlobalLoading,
        addXp,
        handleGameComplete,
        isSettingsModalOpen,
        handleOpenSettings: () => setIsSettingsModalOpen(true),
        handleCloseSettings: () => setIsSettingsModalOpen(false),
        appScreen,
        routeParams
    } : undefined;
    
    if (!appContextValue) {
        return <LoginSetupScreen onSetupComplete={handleSaveSettings} />;
    }
    
    return (
        <AppContext.Provider value={appContextValue}>
            <GlobalSpinner isLoading={globalLoading} />
            {userSettings && <NavBar currentScreen={appScreen} onOpenSettings={() => setIsSettingsModalOpen(true)} />}
            <main className="container mx-auto max-w-7xl">
                {renderScreen()}
            </main>
            {userSettings && <EditSettingsModal isOpen={isSettingsModalOpen} onCancel={() => setIsSettingsModalOpen(false)} />}
        </AppContext.Provider>
    );
};


const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <ToastProvider>
                <App />
            </ToastProvider>
        </React.StrictMode>
    );
}