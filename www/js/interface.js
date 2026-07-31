let grblaxis = 3;
let grblzerocmd = 'X0 Y0 Z0';
let last_axis_letter = 'Z';

const sendCommand = (cmd) => {
    SendPrinterCommand(cmd, true, get_Position);
}

// UI interface
const setClickability = (element, visible) => {
    setDisplay(element, visible ? 'table-row' : 'none');
}

let autocheck = 'report_auto';
const getAutocheck = () => getChecked(autocheck);
const setAutocheck = (flag) => setChecked(autocheck, flag);

const build_axis_selection = () => {
    let html = "<select class='form-control wauto' id='control_select_axis' onchange='control_changeaxis()' >";
    for (let i = 3; i <= grblaxis; i++) {
        let letter;
        if (i == 3) letter = "Z";
        else if (i == 4) letter = "A";
        else if (i == 5) letter = "B";
        else if (i == 6) letter = "C";
        html += "<option value='" + letter + "'";
        if (i == 3) html += " selected ";
        html += ">";
        html += letter;
        html += "</option>\n";
    }

    html += "</select>\n";
    if (grblaxis > 3) {
        setHTML("axis_selection", html);
        setHTML("axis_label", translate_text_item("Axis") + ":");
        setClickability("axis_selection", true)
    }
}

const control_changeaxis = () => {
    let letter = getValue('control_select_axis');
    setHTML('axisup', '+' + letter);
    setHTML('axisdown', '-' + letter);
    setHTML('homeZlabel', ' ' + letter + ' ');
    switch (last_axis_letter) {
        case 'Z':
            axis_feedrate[2] = getValue('control_z_velocity');
            break;
        case 'A':
            axis_feedrate[3] = getValue('control_a_velocity');
            break;
        case 'B':
            axis_feedrate[4] = getValue('control_b_velocity');
            break;
        case 'C':
            axis_feedrate[5] = getValue('control_c_velocity');
            break;
    }

    last_axis_letter = letter;
    switch (last_axis_letter) {
        case 'Z':
            setValue('control_z_velocity', axis_feedrate[2]);
            break;
        case 'A':
            setValue('control_a_velocity', axis_feedrate[3]);
            break;
        case 'B':
            setValue('control_b_velocity', axis_feedrate[4]);
            break;
        case 'C':
            setValue('control_c_velocity', axis_feedrate[5]);
            break;
    }
}
const init_grbl_panel = () => {
    grbl_set_probe_detected(false);
}
const grbl_clear_status = () => {
    grbl_set_probe_detected(false);
    grbl_error_msg = "";
    setHTML("grbl_status_text", grbl_error_msg);
    setHTML("grbl_status", "");
}

let reportType = 'none';

let interval_status = -1;

const disablePolling = () => {
    setAutocheck(false);
    // setValue('statusInterval_check', 0);
    if (interval_status != -1) {
        clearInterval(interval_status);
        interval_status = -1;
    }

    grbl_clear_status();
    reportType = 'none';
}

const enablePolling = () => {
    const interval = parseFloat(getValue('statusInterval_check'));
    if (!isNaN(interval) && interval == 0) {
        if (interval_status != -1) {
            clearInterval(interval_status);
        }
        disablePolling();
        reportNone();
        return;
    }
    if (!isNaN(interval) && interval > 0 && interval < 100) {
        if (interval_status != -1) {
            clearInterval(interval_status);
        }
        interval_status = setInterval(() => {
            get_status()
        }, interval * 1000);
        reportType = 'polled';
        setChecked('report_poll', true);
        return;
    }
    setValue("statusInterval_check", 0);
    alertdlg(translate_text_item("Out of range"), translate_text_item("Value of auto-check must be between 0s and 99s !!"));
    disablePolling();
    reportNone();
}

const tryAutoReport = () => {
    if (reportType == 'polled') {
        disablePolling();
    }
    reportType == 'auto';
    const interval = id('autoReportInterval').value;
    if (interval == 0) {
        enablePolling();
        return;
    }
    setChecked('report_auto', true);
    reportType = 'auto';
    SendPrinterCommand("$Report/Interval="+interval, true,
                       // Do nothing more on success
                       () => {},

                       // Fall back to polling if the firmware does not support auto-reports
                       () => {    
                           enablePolling();
                       },

                       99.1, 1);
}
const onAutoReportIntervalChange = () => {
    tryAutoReport();
}

const disableAutoReport = () => {
    SendPrinterCommand("$Report/Interval=0", true, null, null, 99.0, 1);
    setChecked('report_auto', false);
}

const reportNone = () => {
    switch (reportType) {
        case 'polled':
            disablePolling();
            break;
        case 'auto':
            disableAutoReport();
            break;
    }
    setChecked('report_none', true);
    reportType = 'none';
}

const reportPolled = () => {
    if (reportType == 'auto') {
        disableAutoReport();
    }
    enablePolling();
}

const onReportType = (e) => {
    switch (e.value) {
        case 'none':
            reportNone();
            break;
        case 'auto':
            tryAutoReport()
            break;
        case 'poll':
            reportPolled();
            break;
    }
}

const onstatusIntervalChange = () => {
    enablePolling();
}

//TODO handle authentication issues
//errorfn cannot be NULL
const get_status = () => {      
    sendRealtimeCmd('\x3f'); // '?'
}

const show_grbl_position = (wpos, mpos) => {
    if (wpos) {
        wpos.forEach((pos, axis) => {
            const element =  'control_' + axisNames[axis] + '_position';
            setHTML(element, pos.toFixed(3));
        });
    }
    if (mpos) {
        mpos.forEach((pos, axis) => {
            const element = 'control_' + axisNames[axis] + 'm_position';
            setHTML(element, pos.toFixed(3));
        });
    }
}

const clickableFromStateName = (state, hasSD) => {
    const clickable = {
        resume: false,
        pause: false,
        reset: false
    }
    switch(state) {
        case 'Run':
            clickable.pause = true;
            clickable.reset = true;
            break;
        case 'Door1':
            clickable.reset = true;
            break;
        case 'Door0':
        case 'Hold':
            clickable.resume = true;
            clickable.reset = true;
            break;
        case 'Alarm':
            if (hasSD) {
                //guess print is stopped because of alarm so no need to pause
                clickable.resume = true;
            }
            break;
        case 'Idle':
        case 'Jog':
        case 'Home':
        case 'Check':
        case 'Sleep':
            break;
    }
    return clickable;
}

const show_grbl_status = (stateName, message, hasSD) => {
    if (stateName) {
        const clickable = clickableFromStateName(stateName, hasSD);
        setHTML('grbl_status', stateName);
        setClickability('sd_resume_btn', clickable.resume);
        setClickability('sd_pause_btn', clickable.pause);
        setClickability('sd_reset_btn', clickable.reset);

        // This notification seems unnecessary; the hold state indication is enough
        // if (stateName == 'Hold' && is_probing) {
        //     probe_failed_notification('Probe Paused');
        // }
    }

    setHTML('grbl_status_text', translate_text_item(message));
    setClickability('clear_status_btn', stateName == 'Alarm');
}

const show_grbl_SD = (sdName, sdPercent) => {
    const status = sdName ? sdName + '&nbsp;<progress id="print_prg" value=' + sdPercent + ' max="100"></progress>' + sdPercent + '%' : '';
    setHTML('grbl_SD_status', status);
}

const mainGrblState = (grblstate) => {
    show_grbl_position(WPOS, MPOS);
    show_grbl_status(grblstate.stateName, grblstate.message, grblstate.sdName);
    show_grbl_SD(grblstate.sdName, grblstate.sdPercent);
    show_grbl_probe_status(grblstate.pins && (grblstate.pins.indexOf('P') != -1));
};

const grblHandleOk = () => {
    if (grbl_processfn) {
        grbl_processfn();
        grbl_processfn = null;
        grbl_errorfn = null;
    }
}
const grblHandleError = (msg) => {
    if (grbl_errorfn) {
        grbl_errorfn(msg);
        grbl_errorfn = null;
        grbl_processfn = null;
    }
}

const sendRealtimeCmd = (code) => {
    SendPrinterCommand(code, false, null, null, code, 1);
}

const setupFluidNC = () => {
    sendCommand('$Report/Interval=300')
}

