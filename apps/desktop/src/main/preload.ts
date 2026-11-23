import { contextBridge, ipcRenderer } from 'electron';
import { type ProviderStreamEvent } from '@yourtutor/core';
import { type AppBridge, type StreamSubscription } from '@yourtutor/ui';
import { IPC_CHANNELS } from './ipc.js';

const listeners = new Map<string, (event: ProviderStreamEvent) => void>();

ipcRenderer.on(
  IPC_CHANNELS.streamLessonEvent,
  (_ipcEvent, streamId: string, event: ProviderStreamEvent) => {
    const handler = listeners.get(streamId);
    if (handler) {
      handler(event);
      if (event.type === 'done' || event.type === 'error') {
        listeners.delete(streamId);
      }
    }
  }
);

const electronAppBridge: AppBridge = {
  getHostCapabilities: () => ipcRenderer.invoke(IPC_CHANNELS.getHostCapabilities),
  listCourses: () => ipcRenderer.invoke(IPC_CHANNELS.listCourses),
  getCourse: (courseId) => ipcRenderer.invoke(IPC_CHANNELS.getCourse, courseId),
  createCourse: (input) => ipcRenderer.invoke(IPC_CHANNELS.createCourse, input),
  updateCourseSettings: (courseId, patch) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateCourseSettings, courseId, patch),
  deleteCourse: (courseId) => ipcRenderer.invoke(IPC_CHANNELS.deleteCourse, courseId),
  importAndAnalyzeExam: (input) => ipcRenderer.invoke(IPC_CHANNELS.importAndAnalyzeExam, input),
  listExamItems: (courseId) => ipcRenderer.invoke(IPC_CHANNELS.listExamItems, courseId),
  generateCurriculum: (input) => ipcRenderer.invoke(IPC_CHANNELS.generateCurriculum, input),
  replanRemainingCurriculum: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.replanRemainingCurriculum, input),
  listLessons: (courseId) => ipcRenderer.invoke(IPC_CHANNELS.listLessons, courseId),
  listLessonMessages: (lessonId) => ipcRenderer.invoke(IPC_CHANNELS.listLessonMessages, lessonId),
  streamLessonTurn: (input, onEvent): StreamSubscription => {
    const streamId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    listeners.set(streamId, onEvent);
    ipcRenderer.send(IPC_CHANNELS.streamLessonStart, streamId, input);
    return {
      unsubscribe: () => {
        listeners.delete(streamId);
      },
      abort: () => {
        listeners.delete(streamId);
        ipcRenderer.send(IPC_CHANNELS.streamLessonAbort, streamId);
      },
    };
  },
  gradeAnswer: (input) => ipcRenderer.invoke(IPC_CHANNELS.gradeAnswer, input),
  listMasteryRecords: (courseId) => ipcRenderer.invoke(IPC_CHANNELS.listMasteryRecords, courseId),
  listPracticeAttempts: (courseId) =>
    ipcRenderer.invoke(IPC_CHANNELS.listPracticeAttempts, courseId),
  generateTargetedDrills: (input) => ipcRenderer.invoke(IPC_CHANNELS.generateTargetedDrills, input),
  listProviders: () => ipcRenderer.invoke(IPC_CHANNELS.listProviders),
  listProviderConfigs: () => ipcRenderer.invoke(IPC_CHANNELS.listProviderConfigs),
  saveProviderConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveProviderConfig, input),
  checkProviderHealth: (providerId) =>
    ipcRenderer.invoke(IPC_CHANNELS.checkProviderHealth, providerId),
  listProviderModels: (providerId) =>
    ipcRenderer.invoke(IPC_CHANNELS.listProviderModels, providerId),
  getCompanionServerStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getCompanionServerStatus),
  setCompanionServerEnabled: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.setCompanionServerEnabled, enabled),
};

contextBridge.exposeInMainWorld('yourTutorBridge', electronAppBridge);
