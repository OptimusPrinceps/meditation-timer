'use strict';

// ============================================================================
// UI core — shared DOM cache and view-switching helpers used by every tab.
// ============================================================================

const $ = (id) => document.getElementById(id);

const els = {
  // views
  homeView: $('home-view'),
  settingsView: $('settings-view'),
  sessionView: $('session-view'),
  weightView: $('weight-view'),
  emissionsView: $('emissions-view'),
  wateringView: $('watering-view'),
  calisthenicsView: $('calisthenics-view'),
  weatherView: $('weather-view'),
  // connection status
  serverBanner: $('server-banner'),
  // tab bar
  tabBar: $('tab-bar'),
  btnTabTimer: $('btn-tab-timer'),
  btnTabWeight: $('btn-tab-weight'),
  btnTabEmissions: $('btn-tab-emissions'),
  btnTabWatering: $('btn-tab-watering'),
  btnTabCalisthenics: $('btn-tab-calisthenics'),
  btnTabWeather: $('btn-tab-weather'),
  // weight
  weightDate: $('weight-date'),
  weightKg: $('weight-kg'),
  btnWeightSave: $('btn-weight-save'),
  btnWeightExport: $('btn-weight-export'),
  weightMessage: $('weight-message'),
  weightWeekly: $('weight-weekly'),
  weightCount: $('weight-count'),
  weightChart: $('weight-chart'),
  weightEmpty: $('weight-empty'),
  rangeBtns: document.querySelectorAll('#weight-view .range-btn'),
  goalKg: $('goal-kg'),
  goalDate: $('goal-date'),
  btnGoalSave: $('btn-goal-save'),
  goalStatus: $('goal-status'),
  coachGenerated: $('coach-generated'),
  coachRead: $('coach-read'),
  coachActions: $('coach-actions'),
  btnCoachRefresh: $('btn-coach-refresh'),
  coachStatus: $('coach-status'),
  // emissions
  emissionDate: $('emission-date'),
  btnEmissionLogToday: $('btn-emission-log-today'),
  btnEmissionSave: $('btn-emission-save'),
  emissionMessage: $('emission-message'),
  emissionDaysSince: $('emission-days-since'),
  emissionAvgGap: $('emission-avg-gap'),
  emissionChart: $('emission-chart'),
  emissionEmpty: $('emission-empty'),
  emissionHistory: $('emission-history'),
  // watering — dashboard
  wateringDashboard: $('watering-dashboard'),
  plantList: $('plant-list'),
  btnAddPlant: $('btn-add-plant'),
  plantForm: $('plant-form'),
  plantName: $('plant-name'),
  emojiPalette: $('emoji-palette'),
  btnPlantSave: $('btn-plant-save'),
  btnPlantCancel: $('btn-plant-cancel'),
  plantFormMessage: $('plant-form-message'),
  // watering — detail
  wateringDetail: $('watering-detail'),
  btnWateringBack: $('btn-watering-back'),
  btnPlantRename: $('btn-plant-rename'),
  btnPlantDelete: $('btn-plant-delete'),
  wateringTitle: $('watering-title'),
  wateringDate: $('watering-date'),
  btnWateringLogToday: $('btn-watering-log-today'),
  btnWateringSave: $('btn-watering-save'),
  wateringMessage: $('watering-message'),
  wateringDaysSince: $('watering-days-since'),
  wateringAvgGap: $('watering-avg-gap'),
  wateringChart: $('watering-chart'),
  wateringEmpty: $('watering-empty'),
  wateringHistory: $('watering-history'),
  // calisthenics (Training)
  caliBlockName: $('cali-block-name'),
  caliBlockWeeks: $('cali-block-weeks'),
  caliNextUp: $('cali-next-up'),
  caliSession: $('cali-session'),
  caliDate: $('cali-date'),
  caliExercises: $('cali-exercises'),
  caliNotes: $('cali-notes'),
  btnCaliSave: $('btn-cali-save'),
  caliMessage: $('cali-message'),
  caliExercisePick: $('cali-exercise-pick'),
  caliChart: $('cali-chart'),
  caliEmpty: $('cali-empty'),
  caliHistory: $('cali-history'),
  caliCoachGenerated: $('cali-coach-generated'),
  caliCoachRead: $('cali-coach-read'),
  caliCoachActions: $('cali-coach-actions'),
  btnCaliCoachRefresh: $('btn-cali-coach-refresh'),
  caliCoachStatus: $('cali-coach-status'),
  // weather
  weatherStatus: $('weather-status'),
  weatherHero: $('weather-hero'),
  weatherHourlyCard: $('weather-hourly-card'),
  weatherHourly: $('weather-hourly'),
  weatherDailyCard: $('weather-daily-card'),
  weatherDaily: $('weather-daily'),
  weatherTiles: $('weather-tiles'),
  btnWeatherRefresh: $('btn-weather-refresh'),
  weatherUpdated: $('weather-updated'),
  // home
  homeName: $('home-name'),
  homeTotal: $('home-total'),
  homeBreakdown: $('home-breakdown'),
  btnHomeStart: $('btn-home-start'),
  btnAdvance: $('btn-advance'),
  homeMessage: $('home-message'),
  btnOpenSettings: $('btn-open-settings'),
  btnHomePreview: $('btn-home-preview'),
  // settings
  btnBackHome: $('btn-back-home'),
  configSelect: $('config-select'),
  btnDelete: $('btn-delete'),
  rotationA: $('rotation-a'),
  rotationB: $('rotation-b'),
  btnSaveRotation: $('btn-save-rotation'),
  btnClearRotation: $('btn-clear-rotation'),
  rotationStatus: $('rotation-status'),
  configName: $('config-name'),
  delaySeconds: $('delay-seconds'),
  warmupMinutes: $('warmup-minutes'),
  intervalCount: $('interval-count'),
  intervalMinutes: $('interval-minutes'),
  freeMinutes: $('free-minutes'),
  kegelCount: $('kegel-count'),
  kegelSeconds: $('kegel-seconds'),
  btnSave: $('btn-save'),
  openingGapSec: $('opening-gap-sec'),
  closingGapSec: $('closing-gap-sec'),
  btnSaveBells: $('btn-save-bells'),
  bellsStatus: $('bells-status'),
  totalDisplay: $('total-display'),
  totalBreakdown: $('total-breakdown'),
  message: $('setup-message'),
  // session
  segmentLabel: $('segment-label'),
  countdown: $('countdown'),
  sessionProgress: $('session-progress'),
  btnPause: $('btn-pause'),
  btnResume: $('btn-resume'),
  btnStop: $('btn-stop'),
  btnBack: $('btn-back'),
};

// Scoped after the literal so they can reference the cached views.
els.emissionRangeBtns = els.emissionsView.querySelectorAll('.range-btn');
els.wateringRangeBtns = els.wateringView.querySelectorAll('.range-btn');
els.caliRangeBtns = els.calisthenicsView.querySelectorAll('.range-btn');

function hideAllViews() {
  els.homeView.classList.add('hidden');
  els.settingsView.classList.add('hidden');
  els.sessionView.classList.add('hidden');
  els.weightView.classList.add('hidden');
  els.emissionsView.classList.add('hidden');
  els.wateringView.classList.add('hidden');
  els.calisthenicsView.classList.add('hidden');
  els.weatherView.classList.add('hidden');
}

function setActiveTab(name) {
  els.btnTabTimer.classList.toggle('active', name === 'timer');
  els.btnTabWeight.classList.toggle('active', name === 'weight');
  els.btnTabEmissions.classList.toggle('active', name === 'emissions');
  els.btnTabWatering.classList.toggle('active', name === 'watering');
  els.btnTabCalisthenics.classList.toggle('active', name === 'calisthenics');
  els.btnTabWeather.classList.toggle('active', name === 'weather');
}
