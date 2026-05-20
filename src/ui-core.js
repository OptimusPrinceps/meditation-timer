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
  // tab bar
  tabBar: $('tab-bar'),
  btnTabTimer: $('btn-tab-timer'),
  btnTabWeight: $('btn-tab-weight'),
  btnTabEmissions: $('btn-tab-emissions'),
  btnTabWatering: $('btn-tab-watering'),
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

function hideAllViews() {
  els.homeView.classList.add('hidden');
  els.settingsView.classList.add('hidden');
  els.sessionView.classList.add('hidden');
  els.weightView.classList.add('hidden');
  els.emissionsView.classList.add('hidden');
  els.wateringView.classList.add('hidden');
}

function setActiveTab(name) {
  els.btnTabTimer.classList.toggle('active', name === 'timer');
  els.btnTabWeight.classList.toggle('active', name === 'weight');
  els.btnTabEmissions.classList.toggle('active', name === 'emissions');
  els.btnTabWatering.classList.toggle('active', name === 'watering');
}
