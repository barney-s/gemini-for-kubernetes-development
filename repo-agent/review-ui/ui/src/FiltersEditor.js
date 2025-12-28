import React, { useState, useEffect } from 'react';

function FiltersEditor({ spec, onChange }) {
    const [localSpec, setLocalSpec] = useState(spec);

    useEffect(() => {
        setLocalSpec(spec);
    }, [spec]);

    const handleReviewChange = (field, value) => {
        const newSpec = { ...localSpec };
        if (!newSpec.review) newSpec.review = {};
        newSpec.review[field] = value;
        setLocalSpec(newSpec);
        onChange(newSpec);
    };

    const handleLabelGroupChange = (index, value) => {
        const newSpec = { ...localSpec };
        if (!newSpec.review) newSpec.review = {};
        if (!newSpec.review.labels) newSpec.review.labels = [];
        
        // Value is comma separated string
        const labels = value.split(',').map(s => s.trim()).filter(s => s);
        newSpec.review.labels[index] = labels;
        setLocalSpec(newSpec);
        onChange(newSpec);
    };

    const addLabelGroup = () => {
        const newSpec = { ...localSpec };
        if (!newSpec.review) newSpec.review = {};
        if (!newSpec.review.labels) newSpec.review.labels = [];
        newSpec.review.labels.push([]);
        setLocalSpec(newSpec);
        onChange(newSpec);
    };

    const removeLabelGroup = (index) => {
        const newSpec = { ...localSpec };
        if (!newSpec.review) newSpec.review = {};
        if (!newSpec.review.labels) newSpec.review.labels = [];
        newSpec.review.labels.splice(index, 1);
        setLocalSpec(newSpec);
        onChange(newSpec);
    };

    const handleExcludePRsChange = (value) => {
        const newSpec = { ...localSpec };
        if (!newSpec.review) newSpec.review = {};
        
        const prs = value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        newSpec.review.excludePullRequests = prs;
        setLocalSpec(newSpec);
        onChange(newSpec);
    };

    return (
        <div className="filters-editor">
            <h3>PR Review Filters</h3>
            
            <div className="form-group">
                <label>
                    <input
                        type="checkbox"
                        checked={localSpec.review?.preferAssignedToSelf || false}
                        onChange={(e) => handleReviewChange('preferAssignedToSelf', e.target.checked)}
                    />
                    Prefer Assigned To Self
                </label>
                <p className="help-text">Prioritize PRs assigned to the bot user.</p>
            </div>

            <div className="form-group">
                <label>Exclude Pull Requests (Comma separated IDs)</label>
                <input
                    type="text"
                    value={localSpec.review?.excludePullRequests?.join(', ') || ''}
                    onChange={(e) => handleExcludePRsChange(e.target.value)}
                    className="form-control"
                    placeholder="e.g. 123, 456"
                />
            </div>

            <div className="form-group">
                <label>Label Filters (OR logic between groups, AND logic within group)</label>
                {localSpec.review?.labels?.map((group, index) => (
                    <div key={index} className="label-group" style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <input
                            type="text"
                            value={group.join(', ')}
                            onChange={(e) => handleLabelGroupChange(index, e.target.value)}
                            className="form-control"
                            placeholder="e.g. bug, p0 (Matches 'bug' AND 'p0')"
                            style={{ flex: 1 }}
                        />
                        <button type="button" className="btn btn-delete" onClick={() => removeLabelGroup(index)}>Remove</button>
                    </div>
                ))}
                <button type="button" className="btn" onClick={addLabelGroup}>+ Add Label Group</button>
            </div>
            
            {/* Future: Issue Handler Filters */}
        </div>
    );
}

export default FiltersEditor;
