import { ipcMain } from 'electron';
import { type DesktopTutorController } from './tutor-controller.js';

export const IPC_CHANNELS = {
  getHostCapabilities: 'yourtutor:getHostCapabilities',
  listCourses: 'yourtutor:listCourses',
  getCourse: 'yourtutor:getCourse',
  createCourse: 'yourtutor:createCourse',
  updateCourseSettings: 'yourtutor:updateCourseSettings',
  deleteCourse: 'yourtutor:deleteCourse',
  importAndAnalyzeExam: 'yourtutor:importAndAnalyzeExam',
  listExamItems: 'yourtutor:listExamItems',
  generateCurriculum: 'yourtutor:generateCurriculum',
  replanRemainingCurriculum: 'yourtutor:replanRemainingCurriculum',
  listLessons: 'yourtutor:listLessons',
  listLessonMessages: 'yourtutor:listLessonMessages',
  streamLessonStart: 'yourtutor:streamLessonStart',
  streamLessonAbort: 'yourtutor:streamLessonAbort',
  streamLessonEvent: 'yourtutor:streamLessonEvent',
  gradeAnswer: 'yourtutor:gradeAnswer',
  listMasteryRecords: 'yourtutor:listMasteryRecords',
  listPracticeAttempts: 'yourtutor:listPracticeAttempts',
  generateTargetedDrills: 'yourtutor:generateTargetedDrills',
  listProviders: 'yourtutor:listProviders',
  listProviderConfigs: 'yourtutor:listProviderConfigs',
  saveProviderConfig: 'yourtutor:saveProviderConfig',
  checkProviderHealth: 'yourtutor:checkProviderHealth',
  listProviderModels: 'yourtutor:listProviderModels',
  getCompanionServerStatus: 'yourtutor:getCompanionServerStatus',
  setCompanionServerEnabled: 'yourtutor:setCompanionServerEnabled',
} as const;

export function registerDesktopIpcHandlers(controller: DesktopTutorController): void {
  const activeStreams = new Map<string, AbortController>();

  ipcMain.handle(IPC_CHANNELS.getHostCapabilities, () => controller.getHostCapabilities());
  ipcMain.handle(IPC_CHANNELS.listCourses, () => controller.listCourses());
  ipcMain.handle(IPC_CHANNELS.getCourse, (_e, courseId: string) => controller.getCourse(courseId));
  ipcMain.handle(
    IPC_CHANNELS.createCourse,
    (_e, input: Parameters<DesktopTutorController['createCourse']>[0]) =>
      controller.createCourse(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.updateCourseSettings,
    (
      _e,
      courseId: string,
      patch: Parameters<DesktopTutorController['updateCourseSettings']>[1]
    ) => controller.updateCourseSettings(courseId, patch)
  );
  ipcMain.handle(IPC_CHANNELS.deleteCourse, (_e, courseId: string) =>
    controller.deleteCourse(courseId)
  );
  ipcMain.handle(
    IPC_CHANNELS.importAndAnalyzeExam,
    (_e, input: Parameters<DesktopTutorController['importAndAnalyzeExam']>[0]) =>
      controller.importAndAnalyzeExam(input)
  );
  ipcMain.handle(IPC_CHANNELS.listExamItems, (_e, courseId: string) =>
    controller.listExamItems(courseId)
  );
  ipcMain.handle(
    IPC_CHANNELS.generateCurriculum,
    (_e, input: Parameters<DesktopTutorController['generateCurriculum']>[0]) =>
      controller.generateCurriculum(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.replanRemainingCurriculum,
    (_e, input: Parameters<DesktopTutorController['replanRemainingCurriculum']>[0]) =>
      controller.replanRemainingCurriculum(input)
  );
  ipcMain.handle(IPC_CHANNELS.listLessons, (_e, courseId: string) =>
    controller.listLessons(courseId)
  );
  ipcMain.handle(IPC_CHANNELS.listLessonMessages, (_e, lessonId: string) =>
    controller.listLessonMessages(lessonId)
  );
  ipcMain.handle(
    IPC_CHANNELS.gradeAnswer,
    (_e, input: Parameters<DesktopTutorController['gradeAnswer']>[0]) =>
      controller.gradeAnswer(input)
  );
  ipcMain.handle(IPC_CHANNELS.listMasteryRecords, (_e, courseId: string) =>
    controller.listMasteryRecords(courseId)
  );
  ipcMain.handle(IPC_CHANNELS.listPracticeAttempts, (_e, courseId: string) =>
    controller.listPracticeAttempts(courseId)
  );
  ipcMain.handle(
    IPC_CHANNELS.generateTargetedDrills,
    (_e, input: Parameters<DesktopTutorController['generateTargetedDrills']>[0]) =>
      controller.generateTargetedDrills(input)
  );
  ipcMain.handle(IPC_CHANNELS.listProviders, () => controller.listProviders());
  ipcMain.handle(IPC_CHANNELS.listProviderConfigs, () => controller.listProviderConfigs());
  ipcMain.handle(
    IPC_CHANNELS.saveProviderConfig,
    (_e, input: Parameters<DesktopTutorController['saveProviderConfig']>[0]) =>
      controller.saveProviderConfig(input)
  );
  ipcMain.handle(IPC_CHANNELS.checkProviderHealth, (_e, providerId: string) =>
    controller.checkProviderHealth(providerId)
  );
  ipcMain.handle(IPC_CHANNELS.listProviderModels, (_e, providerId: string) =>
    controller.listProviderModels(providerId)
  );
  ipcMain.handle(IPC_CHANNELS.getCompanionServerStatus, () =>
    controller.getCompanionServerStatus()
  );
  ipcMain.handle(IPC_CHANNELS.setCompanionServerEnabled, (_e, enabled: boolean) =>
    controller.setCompanionServerEnabled(enabled)
  );

  ipcMain.on(
    IPC_CHANNELS.streamLessonStart,
    (
      event,
      streamId: string,
      input: Parameters<DesktopTutorController['streamLessonTurn']>[0]
    ) => {
      const abortController = new AbortController();
      activeStreams.set(streamId, abortController);

      void (async () => {
        try {
          for await (const streamEvent of controller.streamLessonTurn(
            input,
            abortController.signal
          )) {
            if (!event.sender.isDestroyed()) {
              event.sender.send(IPC_CHANNELS.streamLessonEvent, streamId, streamEvent);
            }
          }
        } catch (err) {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.streamLessonEvent, streamId, {
              type: 'error',
              error: {
                code: 'UNKNOWN',
                message: err instanceof Error ? err.message : String(err),
              },
            });
          }
        } finally {
          activeStreams.delete(streamId);
        }
      })();
    }
  );

  ipcMain.on(IPC_CHANNELS.streamLessonAbort, (_event, streamId: string) => {
    const active = activeStreams.get(streamId);
    if (active) {
      active.abort();
      activeStreams.delete(streamId);
    }
  });
}
