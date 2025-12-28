import React, { useState, useEffect, useCallback } from 'react';
import yaml from 'js-yaml';
import DeleteRepo from './DeleteRepo';
import FiltersEditor from './FiltersEditor';

function UpdateRepo({ repo, onCancel, onRepoUpdated, onRepoDeleted }) {
    const [activeTab, setActiveTab] = useState('config'); // 'config' or 'instructions'
    const [yamlContent, setYamlContent] = useState('');
    const [originalYamlContent, setOriginalYamlContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [parsedSpec, setParsedSpec] = useState({});

    // Instructions state
    const [currentInstructions, setCurrentInstructions] = useState('');
    const [draftInstructions, setDraftInstructions] = useState('');
    const [originalDraftInstructions, setOriginalDraftInstructions] = useState('');
    const [hasDraft, setHasDraft] = useState(false);
    const [instructionsError, setInstructionsError] = useState('');
    const [isInstructionsLoading, setIsInstructionsLoading] = useState(false);

    useEffect(() => {
        setIsLoading(true);
        fetch(`/api/repos/${repo.name}/yaml`)
            .then(res => {
                if (!res.ok) throw new Error("Failed to fetch repo YAML");
                return res.json();
            })
            .then(data => {
                if (data.yaml) {
                    setYamlContent(data.yaml);
                    setOriginalYamlContent(data.yaml);
                }
                setIsLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError(err.message);
                setIsLoading(false);
            });
    }, [repo.name]);

    const fetchInstructions = useCallback(() => {
        setIsInstructionsLoading(true);
        fetch(`/api/repos/${repo.name}/instructions`)
            .then(res => {
                if (!res.ok) throw new Error("Failed to fetch instructions");
                return res.json();
            })
            .then(data => {
                setCurrentInstructions(data.current || '');
                setDraftInstructions(data.draft || '');
                setOriginalDraftInstructions(data.draft || '');
                setHasDraft(!!data.draft);
                setIsInstructionsLoading(false);
            })
            .catch(err => {
                console.error(err);
                setInstructionsError(err.message);
                setIsInstructionsLoading(false);
            });
    }, [repo.name]);

    useEffect(() => {
        if (activeTab === 'instructions') {
            fetchInstructions();
        }
    }, [activeTab, fetchInstructions]);

    const submitConfig = async (content) => {
        setError('');
        setIsLoading(true);

        try {
            const parsed = yaml.load(content);
            if (!parsed) throw new Error("YAML is empty or invalid");

            const currentRepoURL = parsed?.repoURL;
            const originalParsed = yaml.load(originalYamlContent);
            const originalRepoURL = originalParsed?.repoURL;

            if (currentRepoURL && originalRepoURL && currentRepoURL !== originalRepoURL) {
                setError('Repository URL cannot be changed in this interface.');
                setIsLoading(false);
                return;
            }
        } catch (e) {
            setError('Invalid YAML content: ' + e.message);
            setIsLoading(false);
            return;
        }

        fetch(`/api/repos/${repo.name}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ yaml: content })
        })
        .then(async (res) => {
            if (!res.ok) {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to update repository');
                } else {
                    const text = await res.text();
                    throw new Error(text || `Failed to update repository (${res.status})`);
                }
            }
            return res;
        })
        .then(() => {
            setIsLoading(false);
            onRepoUpdated();
        })
        .catch(err => {
            console.error(err);
            const hint = " This often happens for private or restricted repositories if you haven't provided a manual GitHub PAT in 'Settings'.";
            setError(err.message + hint);
            setIsLoading(false);
        });
    };

    const handleConfigSubmit = async (e) => {
        e.preventDefault();
        submitConfig(yamlContent);
    };

    const handleInstructionAction = (action) => {
        setInstructionsError('');
        setIsInstructionsLoading(true);

        const body = {
            current: currentInstructions,
            draft: draftInstructions,
            action: action
        };

        fetch(`/api/repos/${repo.name}/instructions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(async (res) => {
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update instructions');
            }
            return res;
        })
        .then(() => {
            if (action === 'publish' || action === 'discard_draft') {
                 // Refresh to clear draft or update current
                 fetchInstructions();
            } else if (action === 'save_draft') {
                 setHasDraft(true);
                 setOriginalDraftInstructions(draftInstructions);
                 setIsInstructionsLoading(false);
            }
        })
        .catch(err => {
            console.error(err);
            setInstructionsError(err.message);
            setIsInstructionsLoading(false);
        });
    };

    const handleTabChange = (tab) => {
        if (tab === 'filters') {
            try {
                const doc = yaml.load(yamlContent);
                setParsedSpec(doc || {});
            } catch (e) {
                setError("Cannot switch to Filters tab: Invalid YAML");
                return;
            }
        } else if (activeTab === 'filters') {
            try {
                const newYaml = yaml.dump(parsedSpec);
                setYamlContent(newYaml);
            } catch (e) {
                console.error("Failed to dump YAML", e);
                // Don't block switching, but maybe warn?
            }
        }
        setActiveTab(tab);
        setError('');
    };

    return (
        <div className="add-repo-container" style={{maxWidth: '1000px'}}>
            <h2>Repository Settings: {repo.name}</h2>
            
            <div className="repo-tabs" style={{justifyContent: 'flex-start', marginBottom: '20px'}}>
                <button 
                    className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
                    onClick={() => handleTabChange('config')}
                >
                    Configuration
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'filters' ? 'active' : ''}`}
                    onClick={() => handleTabChange('filters')}
                >
                    Filters
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'instructions' ? 'active' : ''}`}
                    onClick={() => handleTabChange('instructions')}
                >
                    User Instructions
                    {hasDraft && <span style={{marginLeft: '5px', color: '#orange'}}>●</span>} 
                </button>
            </div>

            {activeTab === 'config' && (
                <>
                    {error && <div className="message error">{error}</div>}
                    <form onSubmit={handleConfigSubmit} className="add-repo-form">
                        <div className="form-group">
                            <label htmlFor="repoYaml">RepoWatch Spec (YAML):</label>
                            <textarea
                                id="repoYaml"
                                value={yamlContent}
                                onChange={(e) => setYamlContent(e.target.value)}
                                className="yaml-editor"
                                rows={20}
                                disabled={isLoading}
                                style={{fontFamily: 'monospace', width: '100%', whiteSpace: 'pre'}}
                            />
                        </div>
                        <div className="form-actions">
                            <button type="submit" className="btn btn-submit" disabled={isLoading}>
                                {isLoading ? 'Updating...' : 'Update Repowatch'}
                            </button>
                            <button type="button" className="btn" onClick={onCancel} disabled={isLoading}>
                                Cancel
                            </button>
                        </div>
                    </form>
                </>
            )}

            {activeTab === 'filters' && (
                <>
                    {error && <div className="message error">{error}</div>}
                    <div className="add-repo-form">
                        <FiltersEditor 
                            spec={parsedSpec} 
                            onChange={(newSpec) => setParsedSpec(newSpec)} 
                        />
                        <div className="form-actions">
                            <button 
                                type="button" 
                                className="btn btn-submit" 
                                disabled={isLoading}
                                onClick={(e) => {
                                    // Update yamlContent from parsedSpec then submit
                                    try {
                                        const newYaml = yaml.dump(parsedSpec);
                                        setYamlContent(newYaml);
                                        // We need to wait for state update? No, existing handleConfigSubmit uses yamlContent state.
                                        // But setYamlContent is async.
                                        // We can't rely on state update immediately.
                                        // Let's modify handleConfigSubmit to accept content argument or refactor.
                                        // For now, I'll just hack it by setting state and calling a specialized submit or verify if handleConfigSubmit uses state reference.
                                        // It uses `yamlContent` from closure. So we need to pass it.
                                        
                                        // Creating a synthetic event? No.
                                        // Let's create a submit handler that takes the yaml string.
                                        
                                        // For now, I'll update state and use a separate submit function.
                                        // Or better: update yamlContent and trigger submit in useEffect? No.
                                        
                                        // I'll refactor handleConfigSubmit to take optional yaml string.
                                    } catch (err) {
                                        setError("Failed to generate YAML: " + err.message);
                                        return;
                                    }
                                    
                                    // Actually, I can just call fetch directly here similar to handleConfigSubmit
                                    // But handleConfigSubmit has validation logic.
                                    
                                    // Let's create a submit helper.
                                    const content = yaml.dump(parsedSpec);
                                    // Update state for consistency
                                    setYamlContent(content); 
                                    
                                    // Re-implement submit logic here for now to avoid complex refactoring
                                    // OR, I can pass the content to handleConfigSubmit if I change its signature.
                                    // But it's an event handler.
                                    
                                    submitConfig(content);
                                }}
                            >
                                {isLoading ? 'Updating...' : 'Save Filters'}
                            </button>
                            <button type="button" className="btn" onClick={onCancel} disabled={isLoading}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'instructions' && (
                <div className="instructions-container">
                    {instructionsError && <div className="message error">{instructionsError}</div>}
                    
                    <div style={{display: 'flex', gap: '20px', flexDirection: 'column'}}>
                        <div style={{flex: 1}}>
                            <h3>Current Instructions</h3>
                            <textarea
                                value={currentInstructions}
                                onChange={(e) => setCurrentInstructions(e.target.value)}
                                className="yaml-editor"
                                rows={20}
                                disabled={isInstructionsLoading}
                                style={{fontFamily: 'monospace', width: '100%', whiteSpace: 'pre'}}
                                placeholder="No user instructions defined."
                            />
                             <div className="form-actions" style={{marginTop: '10px'}}>
                                <button 
                                    className="btn btn-submit" 
                                    onClick={() => handleInstructionAction('publish')}
                                    disabled={isInstructionsLoading || (hasDraft && !window.confirm("This will overwrite current instructions with the content in this box and DISCARD the draft. Are you sure?"))}
                                    title="Save changes to current instructions directly"
                                >
                                    Update Current
                                </button>
                            </div>
                        </div>

                        {hasDraft && (
                            <div style={{flex: 1, borderTop: '1px solid #eee', paddingTop: '20px'}}>
                                <h3 style={{color: '#d9534f'}}>Proposed Draft</h3>
                                <textarea
                                    value={draftInstructions}
                                    onChange={(e) => setDraftInstructions(e.target.value)}
                                    className="yaml-editor"
                                    rows={20}
                                    disabled={isInstructionsLoading}
                                    style={{fontFamily: 'monospace', width: '100%', whiteSpace: 'pre', border: '1px solid #d9534f'}}
                                />
                                <div className="form-actions" style={{marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                    <button 
                                        className="btn btn-submit" 
                                        style={{backgroundColor: '#5cb85c'}}
                                        onClick={() => {
                                            // Copy draft to current then publish
                                            setCurrentInstructions(draftInstructions);
                                            // We need to wait for state update? No, we pass values to API.
                                            // But handleInstructionAction uses state 'currentInstructions'.
                                            // So we should construct a special call.
                                            setInstructionsError('');
                                            setIsInstructionsLoading(true);
                                            fetch(`/api/repos/${repo.name}/instructions`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ current: draftInstructions, draft: '', action: 'publish' })
                                            }).then(() => {
                                                fetchInstructions();
                                            }).catch(e => {
                                                setInstructionsError(e.message);
                                                setIsInstructionsLoading(false);
                                            });
                                        }}
                                        disabled={isInstructionsLoading}
                                    >
                                        Approve & Publish
                                    </button>
                                    <button 
                                        className="btn" 
                                        onClick={() => handleInstructionAction('save_draft')}
                                        disabled={isInstructionsLoading || draftInstructions === originalDraftInstructions}
                                    >
                                        Save Draft
                                    </button>
                                    <button 
                                        className="btn btn-delete" 
                                        onClick={() => {
                                            if (window.confirm("Are you sure you want to discard this draft?")) {
                                                handleInstructionAction('discard_draft');
                                            }
                                        }}
                                        disabled={isInstructionsLoading}
                                    >
                                        Reject / Discard
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                     <div className="form-actions" style={{marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px'}}>
                        <button type="button" className="btn" onClick={onCancel} disabled={isInstructionsLoading}>
                            Back / Cancel
                        </button>
                    </div>
                </div>
            )}
            
            <div style={{marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '20px'}}>
                <h3 style={{color: '#d9534f'}}>Danger Zone</h3>
                <div style={{border: '1px solid #d9534f', padding: '15px', borderRadius: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div>
                        <strong>Delete repowatch</strong>
                        <p style={{margin: '5px 0 0 0', fontSize: '0.9em', color: '#666'}}>
                            Unsubmitted reviews would be deleted. You can always add the repo again.
                        </p>
                    </div>
                    <DeleteRepo repo={repo} onRepoDeleted={onRepoDeleted} />
                </div>
            </div>
        </div>
    );
}

export default UpdateRepo;
