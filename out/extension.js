"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
let statusBar;
let timer;
let secondsLeft = 0;
let isWorking = false;
let pomodoroCount = 0;
const WORK_TIME = 25 * 60;
const BREAK_TIME = 5 * 60;
function activate(context) {
    console.log('Помодоро запущен!');
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'pomodoro.click';
    statusBar.text = '🍅 Начать';
    statusBar.show();
    context.subscriptions.push(statusBar);
    let clickCommand = vscode.commands.registerCommand('pomodoro.click', () => {
        if (timer) {
            stopTimer();
        }
        else {
            startWork();
        }
    });
    context.subscriptions.push(clickCommand);
}
function startWork() {
    isWorking = true;
    secondsLeft = WORK_TIME;
    startTimer();
    vscode.window.showInformationMessage('🍅 Начали работать!');
}
function startBreak() {
    isWorking = false;
    secondsLeft = BREAK_TIME;
    startTimer();
    vscode.window.showInformationMessage('☕ Перерыв начался!');
}
function startTimer() {
    updateStatusBar();
    timer = setInterval(() => {
        secondsLeft--;
        updateStatusBar();
        if (secondsLeft <= 0) {
            timerFinished();
        }
    }, 1000);
}
function stopTimer() {
    if (timer) {
        clearInterval(timer);
        timer = undefined;
    }
    statusBar.text = '🍅 Начать';
    vscode.window.showInformationMessage('⏹️ Остановлено');
}
function timerFinished() {
    stopTimer();
    if (isWorking) {
        pomodoroCount++;
        vscode.window.showInformationMessage(`🎉 Помодоро #${pomodoroCount} готов! Отдохнуть?`, 'Да', 'Нет').then(answer => {
            if (answer === 'Да') {
                startBreak();
            }
        });
    }
    else {
        vscode.window.showInformationMessage('☕ Перерыв окончен! Ещё поработаем?', 'Да', 'Нет').then(answer => {
            if (answer === 'Да') {
                startWork();
            }
        });
    }
}
function updateStatusBar() {
    let minutes = Math.floor(secondsLeft / 60);
    let seconds = secondsLeft % 60;
    let timeText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    if (isWorking) {
        statusBar.text = `🍅 ${timeText} (${pomodoroCount})`;
    }
    else {
        statusBar.text = `☕ ${timeText} (${pomodoroCount})`;
    }
}
function deactivate() {
    if (timer) {
        clearInterval(timer);
    }
}
//# sourceMappingURL=extension.js.map