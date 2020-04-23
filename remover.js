const express = require('express')
var bodyParser = require('body-parser')
var cors = require('cors');
var fs = require('fs');
var path = require("path");
var xml2jsConverter = require('xml2js').parseString;
var xml2js = require('xml2js');
var xmlBuilder = new xml2js.Builder();
var Busboy = require('busboy');
var archiver = require('archiver');
const app = express()
app.set('view engine','ejs');
const port = process.env.PORT || 3005
var jsonBodyParser = bodyParser.json();
app.use(bodyParser.json())
app.use(cors());

app.get('/', (req, res) => {
	const zipPath = __dirname + '/update.zip';
    fs.access(zipPath, fs.F_OK, (err) => {
      if (!err) {
        console.log("deleting the update.zip folder from server if exists!!");
        fs.unlinkSync(zipPath);
      }
    });
    res.sendFile(path.join(__dirname + '/home.html'));
});


app.post('/home', (req, res) => {
	const zipPath = __dirname + '/update.zip';
    fs.access(zipPath, fs.F_OK, (err) => {
      if (!err) {
        console.log("deleting the update.zip folder now from server!!");
		fs.unlinkSync(zipPath);
      }
    });
    res.sendFile(path.join(__dirname + '/home.html'));
});

app.post('/downloadZip', (req, res) => {
	const zipPath = __dirname + '/update.zip';
    fs.access(zipPath, fs.F_OK, (err) => {
      if (!err) {
        console.log("downloading the update.zip folder from server!!");
		res.download(zipPath, "update.zip");
      } else {
        res.sendFile(path.join(__dirname + '/nothingToDownload.html'));
      }
    });
});

app.post('/folderupload', (req, res) => {
	global.dynamicChoicesRemovedFromFiles = [];
    var busboy = new Busboy({
        headers: req.headers
    });
    var newXMLFile;
    var outputFilePath = __dirname + '/update.zip';
    var output = fs.createWriteStream(outputFilePath);
    console.log("created file");
    var archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });
    var actionDefinitionFiles = {};
    var otherFiles = {};
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
		if (filename.includes("sys_hub_action_type_definition")) {
            actionDefinitionFiles[filename] = "";
        } else {
			otherFiles[filename] = "";
        }
        file.on('data', function(data) {
            if (filename.includes("sys_hub_action_type_definition")) {
                actionDefinitionFiles[filename] += data;
            } else {
                otherFiles[filename] += data;
            }
        });
        file.on('end', function() {
        });
    });
    busboy.on('finish', function() {
        Object.keys(actionDefinitionFiles).forEach((key, index) => {
            xml2jsConverter(actionDefinitionFiles[key], function(err, result) {
                newXMLFile = removeDynamicChoicesFromFile(result);
            })
            if(newXMLFile) {
                archive.append(newXMLFile, { name: key });
            } else {
                archive.append(actionDefinitionFiles[key], { name: key });
            }
        })
        Object.keys(otherFiles).forEach((key, index) => {
            archive.append(otherFiles[key], { name: key });
        })
        archive.pipe(output);
        archive.finalize();
        output.on('close', function() {
            console.log("so deleted choices are ==> "+JSON.stringify(dynamicChoicesRemovedFromFiles));
            if(dynamicChoicesRemovedFromFiles && dynamicChoicesRemovedFromFiles.length > 0) {
                res.render('showRemovedChoicesAndActions',{dynamicChoicesRemovedFromFiles : dynamicChoicesRemovedFromFiles});
            } else {
                res.sendFile(path.join(__dirname + '/noChoices.html'));
            }

        });
    });
    req.pipe(busboy);
});


function removeDynamicChoicesFromFile(result) {

	var sysIdsOfDynamicChoices = [];
	var dynamicChoicesInternalNames = [];
	var dynamicChoicesLabels = {};
	var fileName = "", fileLabel = "";
    /* Fetching sys_id of all the dynamic inputs */

    if (result.record_update.sys_hub_action_input_action_instance) {
        result.record_update.sys_hub_action_input_action_instance.map(function(element) {
            if (element.action_input) {
                element.action_input.map(function(elementIn) {
                    if ((elementIn._) && !(sysIdsOfDynamicChoices.contains(elementIn._))) {
                        sysIdsOfDynamicChoices.push(elementIn._);
                    }
                });
            }
        });
    }

    /* Fetching sys_id of all the dynamic inputs completed */


    /* Fetching names of all the dynamic inputs from their sys_id  */

    if (sysIdsOfDynamicChoices.length > 0) {
        sysIdsOfDynamicChoices.map(function(sysIdOfDynamicChoice) {
            if (result.record_update.sys_hub_action_input) {
                result.record_update.sys_hub_action_input.map(function(action_inputs) {
                    if ((action_inputs.element) && ((action_inputs.sys_id) == sysIdOfDynamicChoice) && !(dynamicChoicesInternalNames.contains((
                            action_inputs.element).toString()))) {
                        dynamicChoicesInternalNames.push((action_inputs.element).toString());
                        dynamicChoicesLabels[action_inputs.element] = (action_inputs.label).toString();
                    }
                });
            }
        });
    } else {
        console.log("There are no dynamic inputs for this action!!");
    }

    /* Fetching names of all the dynamic inputs from their sys_id completed */


    /* Removing the dynamic sys_choice */
    if (dynamicChoicesInternalNames && dynamicChoicesInternalNames.length > 0) {
        var choices = [];
        for (dynamicChoiceInternalName of dynamicChoicesInternalNames) {
              if(result && result.record_update) {
	                if(result.record_update.sys_choice) {
							(result.record_update.sys_choice).map(function(element, index) {
	                            if ((element.$.field) && (((element.$.field).toLowerCase()) == dynamicChoiceInternalName)) {
	                                fileLabel = (result.record_update.sys_hub_action_type_definition[0].sys_name).toString();
	                                fileName = (result.record_update.sys_hub_action_type_definition[0].internal_name).toString();
	                                if(!(choices.contains(dynamicChoicesLabels[dynamicChoiceInternalName]))) {
	                                    choices.push(dynamicChoicesLabels[dynamicChoiceInternalName]);
	                                }
	                                console.log("deleting ==> " + dynamicChoiceInternalName + " , " + (element.$.field).toLowerCase() + " , index ==> " + index);
	                                (result.record_update.sys_choice).splice(index, 1);
	                            } else {}
							});
	                }
	          }
        }

		if((choices.length > 0 ) && !(dynamicChoicesRemovedFromFiles.some(dynamicChoiceRemovedFromFile => ((dynamicChoiceRemovedFromFile.actionName == fileName) && (dynamicChoiceRemovedFromFile.actionLabel == fileLabel))))){
			dynamicChoicesRemovedFromFiles.push({
			    actionLabel : fileLabel,
			    actionName : fileName,
			    choiceName : choices
			});
		}

        return (xmlBuilder.buildObject(result));
    } else {
        return null;
    }
}

Array.prototype.contains = function(needle) {
    for (i in this) {
        if (this[i] == needle) return true;
    }
    return false;
}

app.listen(port, "0.0.0.0", () => console.log(`Example app listening on port ${port}!`));